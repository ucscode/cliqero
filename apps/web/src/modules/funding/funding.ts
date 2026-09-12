import type { Id } from "@/kernel/ids";
import type { Money } from "@/modules/money/money";
import type {
  PaymentConversionSnapshot,
  PaymentInitializationMetadata,
} from "@/modules/payment/payment";

export type FundingState =
  | "initialization_pending"
  | "initializing"
  | "awaiting_payment"
  | "verification_pending"
  | "confirmed"
  | "failed"
  | "blocked"
  | "cancelled"
  | "reconciliation_pending";
export interface FundingTransaction {
  id: Id;
  accountId: Id;
  providerName: string;
  providerReference: string;
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
  findInitializationWork(staleBefore: Date, limit?: number): Promise<readonly FundingTransaction[]>;
  claimInitialization(
    id: Id,
    staleBefore: Date,
    claimedAt: Date,
  ): Promise<FundingTransaction | null>;
  save(value: FundingTransaction): Promise<void>;
}
