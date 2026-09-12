import { newId } from "@/kernel/ids";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import { formatMinorMoney, Money } from "@/modules/money/money";
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
  private async resolvePreparation(input: {
    accountId: string;
    amountMinor: bigint;
    providerName: string;
    collectionCurrency?: string;
    paymentCurrency?: string;
    fundingOptionId?: string;
    requireFundingOption?: boolean;
  }) {
    if (input.amountMinor <= 0n) throw new Error("Funding amount must be positive");
    const account = await this.accounts.findById?.(input.accountId);
    if (!account) throw new Error("Account not found");
    if (!account.country) throw new Error("Account country is required for funding");
    const unscopedProvider = this.providers.get(input.providerName);
    const fundingOptions = unscopedProvider.fundingOptions?.({ country: account.country }) ?? [];
    const selectedFundingOption = input.fundingOptionId
      ? fundingOptions.find((option) => option.id === input.fundingOptionId)
      : undefined;
    if (input.fundingOptionId && !selectedFundingOption)
      throw new Error("The selected receiving account is not eligible");
    if (input.requireFundingOption && fundingOptions.length > 0 && !selectedFundingOption)
      throw new Error("Select a receiving bank account");
    if (
      selectedFundingOption &&
      input.collectionCurrency &&
      input.collectionCurrency.toUpperCase() !== selectedFundingOption.collectionCurrency
    )
      throw new Error("The selected receiving account controls the collection currency");
    const collectionCurrency =
      selectedFundingOption?.collectionCurrency ??
      fundingOptions[0]?.collectionCurrency ??
      this.providers.collectionCurrency(input.providerName, input.collectionCurrency);
    const provider = this.providers.get(input.providerName, {
      country: account.country,
    });
    return {
      country: account.country,
      provider,
      collectionCurrency,
      paymentCurrency: this.providers.paymentCurrency(provider.name, input.paymentCurrency),
      canonicalAmount: Money.of(input.amountMinor, "USD"),
      fundingOptionId: selectedFundingOption?.id,
      fundingOptions,
    };
  }
  private async prepareResolved(
    resolved: Awaited<ReturnType<FundingService["resolvePreparation"]>>,
  ) {
    const providerPreparation = await resolved.provider.prepareFunding?.({
      canonicalAmount: resolved.canonicalAmount,
      collectionCurrency: resolved.collectionCurrency,
      paymentCurrency: resolved.paymentCurrency,
      fundingOptionId: resolved.fundingOptionId,
      country: resolved.country,
    });
    if (providerPreparation)
      return {
        collectionAmount: providerPreparation.collectionAmount,
        paymentCurrency: providerPreparation.paymentCurrency ?? resolved.paymentCurrency,
        conversionSnapshot: providerPreparation.conversionSnapshot,
      };
    const quote =
      resolved.collectionCurrency === "USD"
        ? undefined
        : await this.rates.quote("USD", resolved.collectionCurrency);
    return {
      collectionAmount: quote
        ? new ExactCurrencyConverter().convert(resolved.canonicalAmount, quote)
        : resolved.canonicalAmount,
      paymentCurrency: resolved.paymentCurrency,
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
    };
  }
  async prepare(input: {
    accountId: string;
    amountMinor: bigint;
    providerName: string;
    collectionCurrency?: string;
    paymentCurrency?: string;
    fundingOptionId?: string;
  }) {
    const resolved = await this.resolvePreparation(input);
    const prepared = await this.prepareResolved(resolved);
    return {
      provider: resolved.provider.name,
      canonicalAmount: resolved.canonicalAmount,
      collectionAmount: prepared.collectionAmount,
      paymentCurrency: prepared.paymentCurrency,
      conversionSnapshot: prepared.conversionSnapshot,
      fundingOptions: resolved.fundingOptions,
    };
  }

  async create(input: {
    accountId: string;
    amountMinor: bigint;
    providerName: string;
    idempotencyKey: string;
    collectionCurrency?: string;
    paymentCurrency?: string;
    fundingOptionId?: string;
  }) {
    if (input.amountMinor <= 0n) throw new Error("Funding amount must be positive");
    const resolved = await this.resolvePreparation({ ...input, requireFundingOption: true });
    const existing = await this.funding.findByIdempotency(input.accountId, input.idempotencyKey);
    const canonical = resolved.canonicalAmount;
    if (existing) {
      const existingPaymentCurrency = existing.providerInitialization?.paymentCurrency;
      if (
        existing.providerName !== resolved.provider.name ||
        !existing.canonicalAmount.equals(canonical) ||
        existing.collectionAmount.currency !== resolved.collectionCurrency ||
        (existingPaymentCurrency ?? undefined) !== (resolved.paymentCurrency ?? undefined)
      )
        throw new Error("Idempotency key conflicts with existing funding request");
      return existing;
    }
    const prepared = await this.prepareResolved(resolved);
    const id = newId();
    const value: FundingTransaction = {
      id,
      accountId: input.accountId,
      providerName: resolved.provider.name,
      providerReference:
        resolved.provider.referenceFor?.({ paymentId: id, idempotencyKey: input.idempotencyKey }) ??
        `pay-${id}`,
      canonicalAmount: canonical,
      collectionAmount: prepared.collectionAmount,
      conversionSnapshot: prepared.conversionSnapshot,
      state: "initialization_pending",
      idempotencyKey: input.idempotencyKey,
      providerInitialization: {
        providerDisplayName: resolved.provider.displayName,
        ...(prepared.paymentCurrency ? { paymentCurrency: prepared.paymentCurrency } : {}),
        ...(resolved.fundingOptionId ? { providerAccountId: resolved.fundingOptionId } : {}),
      },
    };
    return this.uow.transaction(async () => {
      const prior = await this.funding.findByIdempotency(input.accountId, input.idempotencyKey);
      if (prior) return prior;
      await this.funding.save(value);
      return value;
    });
  }

  async cancel(input: { accountId: string; fundingId: string }) {
    return this.uow.transaction(async () => {
      const funding = await this.funding.findById(input.fundingId, { forUpdate: true });
      if (!funding || funding.accountId !== input.accountId) throw new Error("Funding not found");
      if (funding.state !== "initialization_pending" && funding.state !== "awaiting_payment")
        throw new Error("Funding cannot be cancelled in its current state");
      const previousState = funding.state;
      funding.state = "cancelled";
      funding.initializationClaimedAt = undefined;
      await this.funding.save(funding);
      await this.funding.recordCancellation?.(funding.id, funding.accountId, previousState);
      return funding;
    });
  }

  async submitTransaction(input: {
    accountId: string;
    fundingId: string;
    transactionHash: string;
  }) {
    const normalized = input.transactionHash.trim();
    if (!/^(0x[a-fA-F0-9]{64}|[a-fA-F0-9]{64})$/.test(normalized))
      throw new Error("Transaction hash is invalid");
    return this.uow.transaction(async () => {
      const funding = await this.funding.findById(input.fundingId, { forUpdate: true });
      if (!funding || funding.accountId !== input.accountId) throw new Error("Funding not found");
      if (funding.providerName !== "usdt_trc20")
        throw new Error("Transaction hash is not supported for this funding method");
      if (funding.state !== "awaiting_payment" && funding.state !== "verification_pending")
        throw new Error("Funding is not awaiting payment");
      const existing = funding.providerInitialization?.transactionHash;
      if (existing === normalized) return funding;
      funding.providerInitialization = {
        ...funding.providerInitialization,
        transactionHash: normalized,
      };
      funding.state = "verification_pending";
      await this.funding.save(funding);
      return funding;
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
    const buyerEmail = await this.accounts.findAuthenticationEmail?.(claim.accountId);
    if (!buyerEmail) throw new Error("Authentication email not found");
    try {
      const provider = this.providers.get(claim.providerName);
      const paymentCurrency = claim.providerInitialization?.paymentCurrency;
      if (provider.minimumPaymentAmount && paymentCurrency) {
        const minimum = await provider.minimumPaymentAmount({
          currencyFrom: claim.collectionAmount.currency,
          currencyTo: paymentCurrency,
        });
        if (claim.collectionAmount.minorAmount < minimum.minorAmount)
          throw new ProviderOperationError(
            claim.providerName,
            "transaction.minimum_amount",
            undefined,
            undefined,
            `The minimum funding amount is ${formatMinorMoney(minimum)}.`,
            "AMOUNT_MINIMAL_ERROR",
            "rejection",
            { amountMinor: minimum.minorAmount.toString(), currency: minimum.currency },
          );
      }
      const result = await provider.initiate({
        paymentId: claim.id,
        amount: claim.collectionAmount,
        idempotencyKey: claim.idempotencyKey,
        buyerEmail,
        country: account.country,
        paymentCurrency: claim.providerInitialization?.paymentCurrency,
        fundingOptionId: claim.providerInitialization?.providerAccountId,
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
          ...f.providerInitialization,
          authorizationUrl: result.authorizationUrl,
          accessCode: result.accessCode,
          ...result.metadata,
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
            operation: diagnostic.operation,
            error: diagnostic,
          });
          if (error instanceof ProviderOperationError)
            f.providerInitialization = {
              ...f.providerInitialization,
              failureCode: error.providerCode,
              failureMessage: error.providerMessage,
              ...(error.details?.amountMinor
                ? { failureAmountMinor: error.details.amountMinor }
                : {}),
              ...(error.details?.currency ? { failureCurrency: error.details.currency } : {}),
            };
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
      result = await this.providers.get(f.providerName).verify({
        reference: f.providerReference,
        expectedAmount: f.collectionAmount,
        initialization: f.providerInitialization,
      });
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
      if (!result.verified && isFundingPendingStatus(result.status)) {
        locked.state =
          locked.state === "verification_pending" ? "verification_pending" : "awaiting_payment";
        await this.funding.save(locked);
        return locked;
      }
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

function isFundingPendingStatus(status: string) {
  return new Set([
    "awaiting_manual_confirmation",
    "awaiting_transaction",
    "not_found",
    "pending",
    "waiting",
    "confirming",
    "confirmed",
    "sending",
    "partially_paid",
    "processing",
  ]).has(status.toLowerCase());
}

export class WalletService {
  constructor(private wallets: WalletRepository) {}
  summary(accountId: string) {
    return this.wallets.summary(accountId);
  }
  history(accountId: string, limit?: number) {
    return this.wallets.history(accountId, limit);
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
    const resolvedAttribution = await this.attribution.resolve(input.attributionSource, listing.id);
    const attribution =
      resolvedAttribution?.referrerAccountId === input.buyerId ? null : resolvedAttribution;
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
          referralReferrerAccountId: attribution?.referrerAccountId ?? null,
        },
        input.idempotencyKey,
        checkoutId,
      );
      await this.purchases.save(purchase);
      // The migrated relational key on checkouts.purchase_id references the
      // purchase row, so persist the two sides of this nullable cycle in
      // dependency order and link the purchase once the checkout exists.
      await this.checkouts.save(checkout);
      await this.purchases.save(purchase);
      return checkout;
    });
  }
}
