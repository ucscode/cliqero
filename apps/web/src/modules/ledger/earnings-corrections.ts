export type EarningsCorrection = {
  id: string;
  accountId: string;
  accountUsername: string;
  sourceEntryId: string;
  purchaseId: string;
  distributionId: string;
  amountMinor: string;
  pendingMinor: string;
  availableMinor: string;
  debtMinor: string;
  reason: string;
  createdBy: string;
  createdByUsername: string;
  correlationId: string;
  idempotencyKey: string;
  createdAt: string;
};

export type CorrectableEarningSource = {
  id: string;
  accountId: string;
  purchaseId: string;
  distributionId: string;
  amountMinor: bigint;
  remainingMinor: bigint;
  balanceState: "pending" | "available";
  maturityAt: Date | null;
  recipientRole: "seller" | "referral";
  referralLevel: number | null;
  settled: boolean;
  reversed: boolean;
};

export interface EarningsCorrectionRepository {
  findSource(id: string): Promise<CorrectableEarningSource | null>;
  lockPurchase(purchaseId: string): Promise<boolean>;
  lockAccount(accountId: string): Promise<void>;
  lockIdempotencyKey(key: string): Promise<void>;
  lockSource(id: string): Promise<CorrectableEarningSource | null>;
  findByIdempotencyKey(key: string): Promise<EarningsCorrection | null>;
  availableEarnings(accountId: string): Promise<bigint>;
  create(input: {
    id: string;
    accountId: string;
    sourceEntryId: string;
    amountMinor: bigint;
    pendingMinor: bigint;
    availableMinor: bigint;
    debtMinor: bigint;
    reason: string;
    actorId: string;
    correlationId: string;
    idempotencyKey: string;
  }): Promise<EarningsCorrection>;
  appendDebit(input: {
    id: string;
    source: CorrectableEarningSource;
    amountMinor: bigint;
    balanceState: "pending" | "available";
    maturityAt: Date | null;
    correctionId: string;
    correlationId: string;
    suffix: "pending" | "available";
  }): Promise<void>;
  list(input: {
    sourceEntryId?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: EarningsCorrection[]; nextCursor: string | null }>;
  get(id: string): Promise<EarningsCorrection | null>;
}
