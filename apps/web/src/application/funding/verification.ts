import type { UnitOfWork } from "@/kernel/unit-of-work";
import type {
  PaymentProviderRegistry,
  PaymentResult,
  PaymentVerificationObservation,
} from "@/modules/payment";
import type { FundingRepository, FundingTransaction } from "@/modules/funding/funding";
import type { PostgresPaymentOperationsRepository } from "@/infrastructure/postgres/payment/operations";
import { ProviderOperationError } from "@/kernel/provider-error";
import { DuplicateProviderTransactionError } from "@/kernel/errors";

export class FundingVerificationProcessor {
  private readonly inFlight = new Set<string>();

  constructor(
    private funding: FundingRepository,
    private providers: PaymentProviderRegistry,
    private uow: UnitOfWork,
    private operations?: PostgresPaymentOperationsRepository,
  ) {}

  async process(
    id: string,
    options: {
      now?: Date;
      rethrowProviderErrors?: boolean;
    } = {},
  ) {
    if (this.inFlight.has(id)) return this.funding.findById(id);
    this.inFlight.add(id);
    try {
      return await this.processOne(id, options);
    } finally {
      this.inFlight.delete(id);
    }
  }

  private async processOne(
    id: string,
    options: {
      now?: Date;
      rethrowProviderErrors?: boolean;
    },
  ) {
    const f = await this.funding.findById(id);
    if (!f || !(f.state === "verification_pending" || f.state === "awaiting_payment")) return null;
    const now = options.now ?? new Date();
    let result;
    try {
      result = await this.verify(f);
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
      const saved = await this.uow.transaction(async () => {
        const locked = await this.funding.findById(id, { forUpdate: true });
        if (!locked || locked.state === "confirmed") return locked;
        locked.providerInitialization = withVerificationObservation(
          locked.providerInitialization,
          {
            status: "provider_error",
            message:
              "We couldn't reach the verification service. Your transaction has been saved and verification will retry automatically.",
          },
          now,
        );
        await this.funding.save(locked);
        return locked;
      });
      if (options.rethrowProviderErrors !== false) throw error;
      return saved;
    }
    return this.persistResult(id, result, now);
  }

  async admitResult(id: string, result: PaymentResult, admittedProviderTransactionId?: string) {
    const persisted = await this.persistResult(id, result, new Date());
    if (
      admittedProviderTransactionId &&
      persisted?.providerTransactionId !== admittedProviderTransactionId
    )
      throw new Error(result.message ?? "This transaction could not be accepted for this funding.");
    return persisted;
  }

  async expire(id: string, now = new Date()) {
    return this.uow.transaction(async () => {
      const funding = await this.funding.findById(id, { forUpdate: true });
      if (
        !funding ||
        (funding.state !== "awaiting_payment" && funding.state !== "verification_pending")
      )
        return funding;
      funding.state = "expired";
      funding.providerInitialization = withVerificationObservation(
        funding.providerInitialization,
        {
          status: "failed",
          message: "This payment session has expired without a confirmed payment.",
          level: "error",
        },
        now,
      );
      await this.funding.save(funding);
      return funding;
    });
  }

  private verify(funding: FundingTransaction) {
    return this.providers.get(funding.providerName).verify({
      reference: funding.providerReference,
      expectedAmount: funding.collectionAmount,
      providerTransactionId: funding.providerTransactionId ?? undefined,
      initialization: funding.providerInitialization,
    });
  }

  private async persistResult(id: string, result: PaymentResult, now: Date) {
    return this.uow.transaction(async () => {
      const locked = await this.funding.findById(id, { forUpdate: true });
      if (!locked || locked.state === "confirmed") return locked;
      const referenceMismatch =
        result.reference !== undefined && result.reference !== locked.providerReference;
      const amountMismatch =
        result.amount !== undefined && !result.amount.equals(locked.collectionAmount);
      const factsMatch = !referenceMismatch && !amountMismatch;
      const identityMismatch =
        !!locked.providerTransactionId &&
        !!result.providerTransactionId &&
        result.providerTransactionId !== locked.providerTransactionId;
      const observation = verificationObservation(result, now);
      if (result.providerTransactionId && factsMatch && !identityMismatch) {
        if (
          locked.providerTransactionId &&
          locked.providerTransactionId !== result.providerTransactionId
        )
          throw new DuplicateProviderTransactionError();
        if (!locked.providerTransactionId) {
          const owner = await this.funding.findByProviderTransactionId(
            locked.providerName,
            result.providerTransactionId,
          );
          if (owner && owner.id !== locked.id) throw new DuplicateProviderTransactionError();
          locked.providerTransactionId = result.providerTransactionId;
        }
      }
      if (!identityMismatch && factsMatch && result.state === "pending") {
        locked.state = locked.providerTransactionId ? "verification_pending" : "awaiting_payment";
        const pendingObservation =
          !locked.providerTransactionId && !result.providerTransactionId
            ? {
                status: "awaiting_transaction" as const,
                message:
                  "Payment has not been identified yet; verification will continue automatically.",
                level: "info" as const,
              }
            : observation;
        locked.providerInitialization = withVerificationObservation(
          locked.providerInitialization,
          pendingObservation,
          now,
        );
        await this.funding.save(locked);
        return locked;
      }
      if (result.state === "reconciliation_required") {
        locked.state = "reconciliation_pending";
        locked.providerInitialization = withVerificationObservation(
          locked.providerInitialization,
          observation,
          now,
        );
        await this.funding.save(locked);
        return locked;
      }
      const mismatch =
        identityMismatch ||
        referenceMismatch ||
        amountMismatch ||
        result.state !== "confirmed" ||
        !result.reference ||
        !result.amount;
      if (mismatch) {
        const code =
          result.state !== "confirmed"
            ? "verification_unsuccessful"
            : referenceMismatch || !result.reference
              ? "verification_reference_mismatch"
              : locked.providerTransactionId &&
                  result.providerTransactionId &&
                  result.providerTransactionId !== locked.providerTransactionId
                ? "verification_transaction_id_mismatch"
                : result.amount && result.amount.currency !== locked.collectionAmount.currency
                  ? "verification_currency_mismatch"
                  : "verification_amount_mismatch";
        await this.operations?.recordFundingFailure({
          fundingId: locked.id,
          provider: locked.providerName,
          operation: "transaction.verify",
          error: {
            providerStatus: result.state === "confirmed",
            providerMessage: "Provider verification did not match persisted funding facts",
            providerCode: code,
            kind: "rejection",
          },
        });
        locked.state = "failed";
        locked.providerInitialization = withVerificationObservation(
          locked.providerInitialization,
          observation,
          now,
        );
        await this.funding.save(locked);
        return locked;
      }
      await this.operations?.recordFundingSuccess({
        fundingId: locked.id,
        provider: locked.providerName,
        operation: "transaction.verify",
      });
      locked.state = "confirmed";
      locked.confirmedAt = now;
      locked.providerInitialization = withVerificationObservation(
        locked.providerInitialization,
        observation,
        now,
      );
      await this.funding.save(locked);
      return locked;
    });
  }
}

function verificationObservation(result: PaymentResult, now: Date) {
  return withVerificationObservation(
    undefined,
    result.observation ?? defaultVerificationObservation(result),
    now,
  ).verification!;
}

function defaultVerificationObservation(result: PaymentResult): PaymentVerificationObservation {
  if (result.state === "confirmed")
    return { status: "success", message: "Payment verified successfully.", level: "success" };
  if (result.state === "pending")
    return {
      status: "confirming",
      message: "Transaction found. Waiting for confirmation.",
      level: "info",
    };
  if (result.state === "failed")
    return {
      status: "failed",
      message: result.message ?? "This payment could not be confirmed.",
      level: "error",
    };
  return {
    status: "provider_error",
    message: result.message ?? "This payment requires provider reconciliation.",
    level: "info",
  };
}

function withVerificationObservation(
  metadata: FundingTransaction["providerInitialization"],
  observation: PaymentVerificationObservation,
  now: Date,
) {
  return {
    ...(metadata ?? {}),
    verification: {
      ...observation,
      level: observation.level ?? verificationObservationLevel(observation.status),
      checkedAt: now.toISOString(),
    },
  };
}

function verificationObservationLevel(status: PaymentVerificationObservation["status"]) {
  if (status === "success") return "success" as const;
  if (status === "confirming" || status === "awaiting_transaction") return "info" as const;
  return "error" as const;
}
