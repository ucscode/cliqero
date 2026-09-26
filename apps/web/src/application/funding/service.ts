import { newId } from "@/kernel/ids";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import { Money } from "@/modules/money/money";
import { ExactCurrencyConverter } from "@/modules/money/exchange";
import type { ExchangeRateService } from "@/modules/money/exchange-service";
import type {
  PaymentFundingOption,
  PaymentProviderRegistry,
  ProviderRequestContext,
} from "@/modules/payment";
import type { AccountReader } from "@/modules/identity/account";
import type { FundingRepository, FundingTransaction } from "@/modules/funding/funding";
import { isVerificationResolved } from "@/modules/funding/funding";
import type { FundingVerificationProcessor } from "./verification";
import type { LifecycleDiagnosticWriter } from "@/kernel/diagnostics";
import { PublicApplicationError } from "@/kernel/errors";

export class FundingService {
  constructor(
    private funding: FundingRepository,
    private providers: PaymentProviderRegistry,
    private rates: ExchangeRateService,
    private accounts: AccountReader,
    private uow: UnitOfWork,
    private verification?: FundingVerificationProcessor,
    private diagnostics?: LifecycleDiagnosticWriter,
  ) {}
  private async resolvePreparation(input: {
    accountId: string;
    amountMinor: bigint;
    providerName: string;
    paymentCurrency?: string;
    fundingOptionId?: string;
    requireFundingOption?: boolean;
  }) {
    if (input.amountMinor <= 0n) throw new Error("Funding amount must be positive");
    const account = await this.accounts.findById?.(input.accountId);
    if (!account) throw new Error("Account not found");
    if (!account.country) throw new Error("Account country is required for funding");
    const provider = this.providers.get(input.providerName, { country: account.country });
    const fundingOptions = provider.fundingOptions?.({ country: account.country }) ?? [];
    const selectedFundingOption = input.fundingOptionId
      ? fundingOptions.find((option) => option.id === input.fundingOptionId)
      : undefined;
    if (input.fundingOptionId && !selectedFundingOption)
      throw new Error("The selected receiving account is not eligible");
    if (input.requireFundingOption && fundingOptions.length > 0 && !selectedFundingOption)
      throw new Error("Select a receiving bank account");
    const collectionCurrency =
      provider.collectionCurrencyFor?.({
        country: account.country,
        fundingOptionId: selectedFundingOption?.id,
      }) ??
      provider.collectionCurrencies?.[0] ??
      "USD";
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
        initializationMetadata: providerPreparation.initializationMetadata,
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

  private snapshotFundingOption(option: PaymentFundingOption | undefined) {
    if (!option) return undefined;
    return {
      id: option.id,
      collectionCurrency: option.collectionCurrency,
      ...(option.instruction ? { instruction: option.instruction } : {}),
      fields: option.fields.map((field) => ({ ...field })),
    };
  }
  async prepare(input: {
    accountId: string;
    amountMinor: bigint;
    providerName: string;
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
    const providerAccountSnapshot = this.snapshotFundingOption(
      resolved.fundingOptions.find((option) => option.id === resolved.fundingOptionId),
    );
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
        ...(prepared.initializationMetadata ?? {}),
        ...(resolved.fundingOptionId ? { providerAccountId: resolved.fundingOptionId } : {}),
        ...(providerAccountSnapshot ? { providerAccountSnapshot } : {}),
      },
    };
    return this.uow.transaction(async () => {
      const prior = await this.funding.findByIdempotency(input.accountId, input.idempotencyKey);
      if (prior) return prior;
      await this.funding.save(value);
      this.diagnostics?.write({
        level: "info",
        event: "funding.created",
        metadata: {
          funding_id: value.id,
          provider: value.providerName,
          amount_minor: value.canonicalAmount.minorAmount.toString(),
          currency: value.canonicalAmount.currency,
        },
      });
      return value;
    });
  }

  async cancel(input: { accountId: string; fundingId: string }) {
    return this.uow.transaction(async () => {
      const funding = await this.funding.findById(input.fundingId, { forUpdate: true });
      if (!funding || funding.accountId !== input.accountId)
        throw new PublicApplicationError("Funding not found", "not_found", 404);
      if (funding.state !== "initialization_pending" && funding.state !== "awaiting_payment")
        throw new PublicApplicationError(
          "Funding cannot be cancelled in its current state",
          "funding_state_conflict",
          409,
        );
      const previousState = funding.state;
      funding.state = "cancelled";
      funding.initializationClaimedAt = undefined;
      await this.funding.save(funding);
      await this.funding.recordCancellation?.(funding.id, funding.accountId, previousState);
      return funding;
    });
  }

  async submitProviderRequest(input: { accountId: string; fundingId: string; payload: unknown }) {
    const persisted = await this.uow.transaction(async () => {
      const funding = await this.funding.findById(input.fundingId, { forUpdate: true });
      if (!funding || funding.accountId !== input.accountId)
        throw new PublicApplicationError("Funding not found", "not_found", 404);
      const directTrc20Submission = isRetryableDirectTrc20Funding(funding);
      if (funding.providerName === "usdt_trc20" && !directTrc20Submission)
        throw new PublicApplicationError(
          "Funding is not available for provider interaction",
          "funding_state_conflict",
          409,
        );
      if (
        !directTrc20Submission &&
        funding.state !== "awaiting_payment" &&
        funding.state !== "verification_pending"
      )
        throw new PublicApplicationError(
          "Funding is not available for provider interaction",
          "funding_state_conflict",
          409,
        );
      return funding;
    });
    if (!this.verification) throw new Error("Funding verification is unavailable");
    const provider = this.providers.get(persisted.providerName);
    if (!provider.handleRequest)
      throw new PublicApplicationError(
        "Payment provider does not accept this request",
        "provider_request_unsupported",
        400,
      );
    const context: ProviderRequestContext = {
      accountId: persisted.accountId,
      fundingId: persisted.id,
      reference: persisted.providerReference,
      expectedAmount: persisted.collectionAmount,
      initialization: persisted.providerInitialization,
    };
    const result = await provider.handleRequest(input.payload, context);
    return this.verification.admitResult(persisted.id, result);
  }
}

function isRetryableDirectTrc20Funding(funding: FundingTransaction) {
  if (funding.providerName !== "usdt_trc20" || funding.providerTransactionId) return false;
  if (
    funding.state !== "initialization_pending" &&
    funding.state !== "awaiting_payment" &&
    funding.state !== "verification_pending" &&
    funding.state !== "failed"
  )
    return false;
  return !isVerificationResolved(funding.providerInitialization?.verification);
}
