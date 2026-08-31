import { newId } from "@/kernel/ids";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import { Money } from "@/modules/money/money";
import { ExactCurrencyConverter } from "@/modules/money/exchange";
import type { ExchangeRateService } from "@/modules/money/exchange-service";
import type { PaymentProviderRegistry } from "@/modules/payment/payment";
import type { AccountReader } from "@/modules/identity/account";
import type { FundingRepository, FundingTransaction } from "@/modules/funding/funding";
import type { WalletRepository } from "@/modules/wallet/wallet";
import type { CheckoutRepository } from "@/modules/checkout/checkout";
import type { ListingRepository } from "@/modules/listing/listing";
import { Purchase, type PurchaseRepository } from "@/modules/purchase/purchase";
import type { PurchaseAttributionResolver } from "@/modules/referral/attribution";
import type { PostgresPaymentOperationsRepository } from "@/providers/paystack/persistence/payment-operations";
import { ProviderOperationError } from "@/kernel/provider-error";

export class FundingService {
  constructor(
    private funding: FundingRepository,
    private providers: PaymentProviderRegistry,
    private rates: ExchangeRateService,
    private accounts: AccountReader,
    private uow: UnitOfWork,
  ) {}
  async create(input: {
    accountId: string;
    amountMinor: bigint;
    providerName: string;
    idempotencyKey: string;
    collectionCurrency?: string;
  }) {
    if (input.amountMinor <= 0n) throw new Error("Funding amount must be positive");
    const existing = await this.funding.findByIdempotency(input.accountId, input.idempotencyKey);
    if (existing) return existing;
    const account = await this.accounts.findById?.(input.accountId);
    if (!account) throw new Error("Account not found");
    const collectionCurrency = this.providers.collectionCurrency(
      input.providerName,
      input.collectionCurrency,
    );
    const provider = this.providers.get(input.providerName, {
      country: account.country,
      currency: collectionCurrency,
    });
    const canonical = Money.of(input.amountMinor, "USD");
    const quote =
      collectionCurrency === "USD" ? undefined : await this.rates.quote("USD", collectionCurrency);
    const collection = quote ? new ExactCurrencyConverter().convert(canonical, quote) : canonical;
    const id = newId();
    const value: FundingTransaction = {
      id,
      accountId: input.accountId,
      providerName: provider.name,
      providerReference:
        provider.referenceFor?.({ paymentId: id, idempotencyKey: input.idempotencyKey }) ??
        `pay-${id}`,
      canonicalAmount: canonical,
      collectionAmount: collection,
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
      state: "initialization_pending",
      idempotencyKey: input.idempotencyKey,
    };
    return this.uow.transaction(async () => {
      const prior = await this.funding.findByIdempotency(input.accountId, input.idempotencyKey);
      if (prior) return prior;
      await this.funding.save(value);
      return value;
    });
  }
}

export class FundingInitializationProcessor {
  constructor(
    private funding: FundingRepository,
    private providers: PaymentProviderRegistry,
    private accounts: AccountReader,
    private uow: UnitOfWork,
    private operations?: PostgresPaymentOperationsRepository,
    private staleClaimMs = 5 * 60_000,
    private clock: () => Date = () => new Date(),
  ) {}
  findWork(limit = 50) {
    const now = this.clock();
    return this.funding.findInitializationWork(new Date(now.getTime() - this.staleClaimMs), limit);
  }
  async process(id: string) {
    const now = this.clock();
    const claim = await this.uow.transaction(() =>
      this.funding.claimInitialization(id, new Date(now.getTime() - this.staleClaimMs), now),
    );
    if (!claim) return null;
    const account = await this.accounts.findById?.(claim.accountId);
    if (!account) throw new Error("Account not found");
    try {
      const result = await this.providers.get(claim.providerName).initiate({
        paymentId: claim.id,
        amount: claim.collectionAmount,
        idempotencyKey: claim.idempotencyKey,
        buyerEmail: account.email,
      });
      if (result.reference !== claim.providerReference)
        throw new ProviderOperationError(
          claim.providerName,
          "transaction.initialize",
          undefined,
          undefined,
          "Provider returned a mismatched reference",
          "initialization_reference_mismatch",
          "rejection",
        );
      return this.uow.transaction(async () => {
        const f = await this.funding.findById(claim.id, { forUpdate: true });
        if (
          !f ||
          f.state !== "initializing" ||
          f.initializationClaimedAt?.getTime() !== claim.initializationClaimedAt?.getTime()
        )
          return null;
        await this.operations?.recordFundingSuccess({
          fundingId: claim.id,
          provider: claim.providerName,
          operation: "transaction.initialize",
        });
        f.providerInitialization = {
          authorizationUrl: result.authorizationUrl,
          accessCode: result.accessCode,
        };
        f.state = "awaiting_payment";
        f.initializationClaimedAt = undefined;
        await this.funding.save(f);
        return f;
      });
    } catch (error) {
      const diagnostic =
        error instanceof ProviderOperationError
          ? error
          : new ProviderOperationError(
              claim.providerName,
              "transaction.initialize",
              undefined,
              undefined,
              "Provider initialization failed",
              undefined,
              "ambiguous",
            );
      await this.uow.transaction(async () => {
        const f = await this.funding.findById(claim.id, { forUpdate: true });
        if (
          f &&
          f.state === "initializing" &&
          f.initializationClaimedAt?.getTime() === claim.initializationClaimedAt?.getTime()
        ) {
          await this.operations?.recordFundingFailure({
            fundingId: claim.id,
            provider: claim.providerName,
            operation: "transaction.initialize",
            error: diagnostic,
          });
          f.state = diagnostic.kind === "ambiguous" ? "reconciliation_pending" : "blocked";
          f.initializationClaimedAt = undefined;
          await this.funding.save(f);
        }
      });
      throw error;
    }
  }
}

export class FundingVerificationProcessor {
  constructor(
    private funding: FundingRepository,
    private providers: PaymentProviderRegistry,
    private uow: UnitOfWork,
    private operations?: PostgresPaymentOperationsRepository,
  ) {}
  async process(id: string) {
    const f = await this.funding.findById(id);
    if (!f || !(f.state === "verification_pending" || f.state === "awaiting_payment")) return null;
    let result;
    try {
      result = await this.providers
        .get(f.providerName)
        .verify({ reference: f.providerReference, expectedAmount: f.collectionAmount });
    } catch (error) {
      const diagnostic =
        error instanceof ProviderOperationError
          ? error
          : new ProviderOperationError(
              f.providerName,
              "transaction.verify",
              undefined,
              undefined,
              "Provider verification failed",
              undefined,
              "ambiguous",
            );
      await this.operations?.recordFundingFailure({
        fundingId: f.id,
        provider: f.providerName,
        operation: "transaction.verify",
        error: diagnostic,
      });
      throw error;
    }
    const mismatch =
      !result.verified ||
      result.status !== "success" ||
      result.reference !== f.providerReference ||
      result.amount.minorAmount !== f.collectionAmount.minorAmount ||
      result.amount.currency !== f.collectionAmount.currency;
    return this.uow.transaction(async () => {
      const locked = await this.funding.findById(id, { forUpdate: true });
      if (!locked || locked.state === "confirmed") return locked;
      if (mismatch) {
        const code =
          !result.verified || result.status !== "success"
            ? "verification_unsuccessful"
            : result.reference !== locked.providerReference
              ? "verification_reference_mismatch"
              : result.amount.currency !== locked.collectionAmount.currency
                ? "verification_currency_mismatch"
                : "verification_amount_mismatch";
        await this.operations?.recordFundingFailure({
          fundingId: locked.id,
          provider: locked.providerName,
          operation: "transaction.verify",
          error: {
            providerStatus: result.verified,
            providerMessage: "Provider verification did not match persisted funding facts",
            providerCode: code,
            kind: "rejection",
          },
        });
        locked.state = "failed";
        await this.funding.save(locked);
        return locked;
      }
      await this.operations?.recordFundingSuccess({
        fundingId: locked.id,
        provider: locked.providerName,
        operation: "transaction.verify",
      });
      locked.state = "confirmed";
      locked.confirmedAt = new Date();
      await this.funding.save(locked);
      return locked;
    });
  }
}

export class WalletService {
  constructor(private wallets: WalletRepository) {}
  summary(accountId: string) {
    return this.wallets.summary(accountId);
  }
  history(accountId: string) {
    return this.wallets.history(accountId);
  }
}

export class WalletCheckoutService {
  constructor(
    private listings: ListingRepository,
    private checkouts: CheckoutRepository,
    private purchases: PurchaseRepository,
    private attribution: PurchaseAttributionResolver,
    private uow: UnitOfWork,
  ) {}
  async initiate(input: {
    buyerId: string;
    listingId: string;
    idempotencyKey: string;
    attributionSource?: string;
  }) {
    const prior = await this.checkouts.findByIdempotency(input.buyerId, input.idempotencyKey);
    if (prior) return prior;
    const listing = await this.listings.findById(input.listingId);
    if (!listing || listing.state !== "published") throw new Error("Listing not found");
    if (listing.price.currency !== "USD") throw new Error("Listings must use canonical USD");
    const snapshot = listing.commercialSnapshot();
    const attribution = await this.attribution.resolve(input.attributionSource, listing.id);
    const checkoutId = newId(),
      purchaseId = newId();
    return this.uow.transaction(async () => {
      const existing = await this.checkouts.findByIdempotency(input.buyerId, input.idempotencyKey);
      if (existing) return existing;
      const checkout = {
        id: checkoutId,
        buyerId: input.buyerId,
        listingId: listing.id,
        purchaseId,
        amount: Money.of(listing.price.minorAmount, "USD"),
        state: "awaiting_funds" as const,
        idempotencyKey: input.idempotencyKey,
      };
      const purchase = new Purchase(
        purchaseId,
        input.buyerId,
        null,
        {
          ...snapshot,
          canonicalPrice: { minorAmount: listing.price.minorAmount.toString(), currency: "USD" },
          referralAttributionId: attribution?.attributionId ?? null,
          referralLinkId: attribution?.referralLinkId ?? null,
          referralReferrerAccountId: attribution?.referrerAccountId ?? null,
        },
        input.idempotencyKey,
        checkoutId,
      );
      await this.checkouts.save(checkout);
      await this.purchases.save(purchase);
      return checkout;
    });
  }
}
