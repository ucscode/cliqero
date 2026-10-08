export type FundingReversalSource = "operator" | "provider_event";

export type FundingReversal = {
  id: string;
  fundingId: string;
  accountId: string;
  amountMinor: string;
  currency: "USD";
  providerCollectionAmountMinor: string | null;
  providerCollectionCurrency: string | null;
  source: FundingReversalSource;
  reason: string;
  providerReference: string | null;
  providerEventId: string | null;
  idempotencyKey: string;
  correlationId: string;
  createdBy: string | null;
  actorSystem: string | null;
  recovery: {
    pendingCreditMinor: string;
    fundingWalletMinor: string;
    earningsWalletMinor: string;
    debtMinor: string;
  };
  createdAt: Date;
};

export type FundingReversalAllocation = FundingReversal["recovery"];

export interface FundingReversalRepository {
  lockIdempotencyKey(key: string): Promise<void>;
  lockAccount(accountId: string): Promise<void>;
  findById(id: string): Promise<FundingReversal | null>;
  findByIdempotencyKey(key: string): Promise<FundingReversal | null>;
  list(input: {
    accountId?: string;
    source?: FundingReversalSource;
    fundingId?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: FundingReversal[]; nextCursor: string | null }>;
  remaining(fundingId: string): Promise<bigint>;
  lockForReversal(
    fundingId: string,
    accountId: string,
  ): Promise<{
    providerOrigin: boolean;
    state: string;
    fundingAmountMinor: bigint;
    collectionAmountMinor: bigint;
    collectionCurrency: string;
    creditAmountMinor: bigint;
    creditState: "pending" | "available" | "cancelled" | null;
  }>;
  reducePendingCredit(fundingId: string, remainingMinor: bigint): Promise<void>;
  providerRefundedCollection(fundingId: string, currency: string): Promise<bigint>;
  availableFunding(accountId: string): Promise<bigint>;
  availableEarnings(accountId: string): Promise<bigint>;
  create(input: Omit<FundingReversal, "createdAt">): Promise<FundingReversal>;
  summary(fundingId: string): Promise<{
    state: "none" | "partial" | "full";
    reversedAmountMinor: string;
    remainingAmountMinor: string;
  }>;
}
