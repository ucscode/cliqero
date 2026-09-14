import type { Id } from "@/kernel/ids";
import type { Money } from "@/modules/money/money";
import type {
  PaymentConversionSnapshot,
  PaymentInitializationMetadata,
  PaymentVerificationObservation,
} from "@/modules/payment/payment";

const verificationObservationStatuses = new Set<PaymentVerificationObservation["status"]>([
  "awaiting_transaction",
  "not_found",
  "confirming",
  "mismatch",
  "failed",
  "provider_error",
  "success",
]);

export function projectVerificationObservation(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const observation = value as Partial<PaymentVerificationObservation>;
  if (
    typeof observation.status !== "string" ||
    !verificationObservationStatuses.has(
      observation.status as PaymentVerificationObservation["status"],
    ) ||
    typeof observation.message !== "string"
  )
    return null;
  return {
    status: observation.status,
    message: observation.message,
    level:
      observation.level ??
      (observation.status === "success"
        ? "success"
        : observation.status === "confirming" || observation.status === "awaiting_transaction"
          ? "info"
          : "error"),
    checked_at: typeof observation.checkedAt === "string" ? observation.checkedAt : null,
    ...(typeof observation.confirmations === "number"
      ? { confirmations: observation.confirmations }
      : {}),
    ...(typeof observation.confirmationsRequired === "number"
      ? { confirmations_required: observation.confirmationsRequired }
      : {}),
  };
}

export type FundingState =
  | "initialization_pending"
  | "initializing"
  | "awaiting_payment"
  | "verification_pending"
  | "confirmed"
  | "failed"
  | "blocked"
  | "cancelled"
  | "expired"
  | "reconciliation_pending";
export interface FundingTransaction {
  id: Id;
  accountId: Id;
  providerName: string;
  providerReference: string;
  /** Immutable opaque provider identity; preserve the accepted text and casing exactly. */
  providerTransactionId?: string | null;
  canonicalAmount: Money;
  collectionAmount: Money;
  conversionSnapshot?: PaymentConversionSnapshot;
  state: FundingState;
  idempotencyKey: string;
  providerInitialization?: PaymentInitializationMetadata;
  confirmedAt?: Date;
  initializationClaimedAt?: Date;
  createdAt?: Date;
}
export type FundingHistoryPage = {
  items: readonly FundingTransaction[];
  nextCursor: string | null;
};
export interface FundingRepository {
  findById(id: Id, options?: { forUpdate?: boolean }): Promise<FundingTransaction | null>;
  findByIdempotency(accountId: Id, key: string): Promise<FundingTransaction | null>;
  findByProviderReference(provider: string, reference: string): Promise<FundingTransaction | null>;
  findByProviderTransactionId(
    provider: string,
    transactionId: string,
  ): Promise<FundingTransaction | null>;
  findActiveForAccount?(accountId: Id): Promise<readonly FundingTransaction[]>;
  recordCancellation?(fundingId: Id, accountId: Id, previousState: FundingState): Promise<void>;
  findHistoryForAccount?(input: {
    accountId: Id;
    cursor?: string;
    limit?: number;
    state?: FundingState;
    active?: boolean;
  }): Promise<FundingHistoryPage>;
  findWork(state: FundingState, limit?: number): Promise<readonly FundingTransaction[]>;
  findExpiredNowPayments?(now: Date, limit?: number): Promise<readonly FundingTransaction[]>;
  findInitializationWork(staleBefore: Date, limit?: number): Promise<readonly FundingTransaction[]>;
  claimInitialization(
    id: Id,
    staleBefore: Date,
    claimedAt: Date,
  ): Promise<FundingTransaction | null>;
  save(value: FundingTransaction): Promise<void>;
}
