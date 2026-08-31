import type { EventOutbox } from "@/kernel/events";
import { newId, type Id } from "@/kernel/ids";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { ListingRepository } from "@/modules/listing/listing";
import { Money } from "@/modules/money/money";
import { Purchase, type PurchaseRepository } from "@/modules/purchase/purchase";
import type {
  PaymentRecord,
  PaymentRepository,
  PaymentProviderRegistry,
} from "@/modules/payment/payment";
import { Entitlement, type EntitlementRepository } from "@/modules/entitlement/entitlement";
import type { PostgresIdempotencyRepository } from "@/infrastructure/postgres/idempotency";
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
    const attribution = await this.attribution.resolve(input.attributionSource, listing.id);
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
      currency: collectionCurrency,
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
          referralLinkId: attribution?.referralLinkId ?? null,
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

export class PaymentCompletionService {
  constructor(
    private payments: PaymentRepository,
    private purchases: PurchaseRepository,
    private entitlements: EntitlementRepository,
    private providers: PaymentProviderRegistry,
    private idempotency: PostgresIdempotencyRepository,
    private outbox: EventOutbox,
    private uow: UnitOfWork,
  ) {}
  async complete(input: { paymentId: Id; correlationId: Id }): Promise<Entitlement> {
    const payment = await this.payments.findById(input.paymentId);
    if (!payment) throw new Error("Payment not found");
    const collectionAmount = payment.collectionAmount ?? payment.amount;
    const verified = await this.providers
      .get(payment.providerName)
      .verify({ reference: payment.providerReference, expectedAmount: collectionAmount });
    if (!verified.verified || verified.status !== "success")
      throw new Error("Payment verification failed");
    if (verified.reference !== payment.providerReference)
      throw new Error("Payment reference mismatch");
    if (!verified.amount.equals(collectionAmount))
      throw new Error("Payment amount or currency mismatch");
    return this.uow.transaction(async () => {
      const lockedPayment = await this.payments.findById(payment.id, { forUpdate: true });
      if (!lockedPayment) throw new Error("Payment not found");
      const purchase = await this.purchases.findByIdempotencyKey(lockedPayment.idempotencyKey);
      if (!purchase) throw new Error("Purchase not found");
      const lockedPurchase = await this.purchases.findById(purchase.id, { forUpdate: true });
      if (!lockedPurchase) throw new Error("Purchase not found");
      const existing = await this.entitlements.findByPurchaseId(lockedPurchase.id);
      if (existing) return existing;
      const key = `${lockedPayment.providerName}:${lockedPayment.providerReference}`;
      const claimed = await this.idempotency.begin("payment-completion", key);
      if (!claimed) {
        const completed = await this.entitlements.findByPurchaseId(lockedPurchase.id);
        if (completed) return completed;
        throw new Error("Payment completion is already processing");
      }
      lockedPayment.state = "verified";
      lockedPayment.providerTransactionId = verified.providerTransactionId;
      lockedPayment.providerFee = verified.providerFee;
      lockedPayment.providerVerifiedPayload = {
        status: verified.status,
        reference: verified.reference,
        amountMinor: verified.amount.minorAmount.toString(),
        currency: verified.amount.currency,
        providerFeeMinor: verified.providerFee?.minorAmount.toString(),
        providerFeeCurrency: verified.providerFee?.currency,
      };
      await this.payments.save(lockedPayment);
      lockedPurchase.markPaid();
      lockedPurchase.complete();
      await this.purchases.save(lockedPurchase);
      const entitlement = new Entitlement(
        newId(),
        lockedPurchase.buyerId,
        lockedPurchase.terms.listingId,
        lockedPurchase.id,
      );
      await this.entitlements.save(entitlement);
      const occurredAt = new Date();
      await this.outbox.append([
        {
          id: newId(),
          name: "purchase.completed",
          aggregateId: lockedPurchase.id,
          correlationId: input.correlationId,
          occurredAt,
          payload: { entitlementId: entitlement.id },
        },
        {
          id: newId(),
          name: "entitlement.created",
          aggregateId: entitlement.id,
          correlationId: input.correlationId,
          occurredAt,
          payload: { purchaseId: lockedPurchase.id },
        },
      ]);
      await this.idempotency.complete("payment-completion", key, entitlement.id, {
        entitlementId: entitlement.id,
      });
      return entitlement;
    });
  }
}
