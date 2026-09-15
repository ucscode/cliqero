import type { UnitOfWork } from "@/kernel/unit-of-work";
import { formatMinorMoney } from "@/modules/money/money";
import type { PaymentProviderRegistry } from "@/modules/payment";
import type { AccountReader } from "@/modules/identity/account";
import type { FundingRepository } from "@/modules/funding/funding";
import type { PostgresPaymentOperationsRepository } from "@/infrastructure/postgres/payment/operations";
import { ProviderOperationError } from "@/kernel/provider-error";
import { DuplicateProviderTransactionError } from "@/kernel/errors";

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
          ...(f.providerInitialization?.providerAccountId
            ? { providerAccountId: f.providerInitialization.providerAccountId }
            : {}),
          ...(f.providerInitialization?.providerAccountSnapshot
            ? { providerAccountSnapshot: f.providerInitialization.providerAccountSnapshot }
            : {}),
        };
        if (
          f.providerTransactionId &&
          result.providerTransactionId &&
          f.providerTransactionId !== result.providerTransactionId
        )
          throw new DuplicateProviderTransactionError();
        if (result.providerTransactionId) f.providerTransactionId = result.providerTransactionId;
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
