import { newId, type Id } from "@/kernel/ids";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { ListingRepository } from "@/modules/listing";
import { Money } from "@/modules/money/money";
import { Purchase, type PurchaseRepository } from "@/modules/purchase/purchase";
import type { PaymentRepository, PaymentProviderRegistry } from "@/modules/payment";
import type { PostgresIdempotencyRepository } from "@/infrastructure/postgres/shared/idempotency";
import type { PurchaseAttributionResolver } from "@/modules/referral/attribution";
import type { AccountReader } from "@/modules/identity/account";
import type { ExchangeRateService } from "@/modules/money/exchange-service";
import { ExactCurrencyConverter } from "@/modules/money/exchange";

export class CheckoutService {
  constructor(
    private listings: ListingRepository,
    private payments: PaymentRepository,
    private purchases: PurchaseRepository,
    private providers: PaymentProviderRegistry,
    private idempotency: PostgresIdempotencyRepository,
    private attribution: PurchaseAttributionResolver,
    private uow: UnitOfWork,
    private accounts?: AccountReader,
    private exchangeRates?: ExchangeRateService,
  ) {}
  async initiate(input: {
    buyerId: Id;
    buyerEmail: string;
    listingId: Id;
    providerName: string;
    idempotencyKey: string;
    attributionSource?: string;
    collectionCurrency?: string;
  }): Promise<{
    paymentId: Id;
    purchaseId: Id;
    provider: string;
    providerReference: string;
    authorizationUrl?: string;
    accessCode?: string;
  }> {
    const existing = await this.payments.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      const existingPurchase = await this.purchases.findByIdempotencyKey(input.idempotencyKey);
      if (!existingPurchase) throw new Error("Checkout purchase is missing");
      return {
        paymentId: existing.id,
        purchaseId: existingPurchase.id,
        provider: existing.providerName,
        providerReference: existing.providerReference,
        authorizationUrl: existing.providerInitialization?.authorizationUrl,
        accessCode: existing.providerInitialization?.accessCode,
      };
    }
    const listing = await this.listings.findById(input.listingId);
    if (!listing) throw new Error("Listing not found");
    const snapshot = listing.commercialSnapshot();
    const resolvedAttribution = await this.attribution.resolve(input.attributionSource, listing.id);
    // A customer cannot earn referral credit for their own purchase. The
    // attribution remains available for other buyers, but it is not attached
    // to a purchase made by the referrer themselves.
    const attribution =
      resolvedAttribution?.referrerAccountId === input.buyerId ? null : resolvedAttribution;
    if (snapshot.price.currency !== "USD")
      throw new Error("A currency provider is required for non-USD checkout");
    const paymentId = newId();
    const purchaseId = newId();
    const buyer = this.accounts?.findById ? await this.accounts.findById(input.buyerId) : null;
    const collectionCurrency = this.providers.collectionCurrency(
      input.providerName,
      input.collectionCurrency,
    );
    const provider = this.providers.get(input.providerName, {
      country: buyer?.country ?? null,
    });
    const prepared = await this.uow.transaction(async () => {
      const claimed = await this.idempotency.begin("checkout", input.idempotencyKey);
      if (!claimed) {
        const prior = await this.payments.findByIdempotencyKey(input.idempotencyKey);
        const priorPurchase = await this.purchases.findByIdempotencyKey(input.idempotencyKey);
        if (prior && priorPurchase)
          return {
            existing: true as const,
            result: {
              paymentId: prior.id,
              purchaseId: priorPurchase.id,
              provider: prior.providerName,
              providerReference: prior.providerReference,
              authorizationUrl: prior.providerInitialization?.authorizationUrl,
              accessCode: prior.providerInitialization?.accessCode,
            },
          };
        throw new Error("Checkout idempotency request is already processing");
      }
      const quote =
        collectionCurrency === listing.price.currency
          ? undefined
          : await this.exchangeRates?.quote(listing.price.currency, collectionCurrency);
      if (collectionCurrency !== listing.price.currency && !quote)
        throw new Error("Exchange rate is unavailable");
      const collectionAmount = quote
        ? new ExactCurrencyConverter().convert(listing.price, quote)
        : listing.price;
      const providerReference =
        provider.referenceFor?.({ paymentId, idempotencyKey: input.idempotencyKey }) ??
        `pay-${paymentId}`;
      const payment = {
        id: paymentId,
        providerName: provider.name,
        providerReference,
        buyerId: input.buyerId,
        listingId: listing.id,
        amount: collectionAmount,
        collectionAmount,
        canonicalAmount: Money.of(listing.price.minorAmount, "USD"),
        idempotencyKey: input.idempotencyKey,
        state: "initialization_pending" as const,
        conversionSnapshot: quote
          ? {
              fromCurrency: quote.fromCurrency,
              toCurrency: quote.toCurrency,
              rate: quote.rate,
              source: quote.source,
              sourceDate: quote.sourceDate,
              observedAt: quote.observedAt,
            }
          : undefined,
        providerInitialization: undefined,
      };
      const purchase = new Purchase(
        purchaseId,
        input.buyerId,
        paymentId,
        {
          ...snapshot,
          canonicalPrice: {
            minorAmount: payment.canonicalAmount.minorAmount.toString(),
            currency: "USD",
          },
          referralAttributionId: attribution?.attributionId ?? null,
          referralReferrerAccountId: attribution?.referrerAccountId ?? null,
        },
        input.idempotencyKey,
      );
      await this.payments.save(payment);
      await this.purchases.save(purchase);
      await this.idempotency.complete("checkout", input.idempotencyKey, purchase.id, {
        paymentId,
        purchaseId,
      });
      return { payment, purchase, collectionAmount };
    });
    if ("existing" in prepared) return prepared.result!;
    await this.idempotency.complete("checkout", input.idempotencyKey, prepared.purchase.id, {
      paymentId: prepared.payment.id,
      purchaseId: prepared.purchase.id,
    });
    return {
      paymentId: prepared.payment.id,
      purchaseId: prepared.purchase.id,
      provider: provider.name,
      providerReference: prepared.payment.providerReference,
    };
  }
}
