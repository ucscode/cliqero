export type OperatorDistribution = {
  id: string;
  purchaseId: string;
  listingId: string;
  listingTitle: string;
  buyer: { id: string; username: string; email: string | null };
  grossAmountMinor: string;
  currency: string;
  referralAllocatedMinor: string;
  platformRemainderMinor: string;
  beneficiaryCount: number;
  completedAt: string;
};
export type OperatorDistributionPage = {
  items: OperatorDistribution[];
  nextCursor: string | null;
};
export type OperatorDistributionDetail = OperatorDistribution & {
  purchaseState: string;
  purchaseCreatedAt: string;
  attribution: {
    id: string | null;
    referrer: { id: string; username: string; email: string | null } | null;
  };
  policySnapshot: unknown;
  allocations: Array<{
    id: string;
    account: { id: string; username: string; email: string | null };
    level: number | null;
    amountMinor: string;
    currency: string;
    direction: "credit" | "debit";
    entryType: string;
    balanceState: string;
    maturityAt: string | null;
    settledAt: string | null;
    originalEntryId: string | null;
    reversalId: string | null;
    createdAt: string;
  }>;
  reversal: {
    id: string;
    reason: string;
    source: string;
    state: string;
    processedAt: string | null;
  } | null;
};
export type OperatorEarningsEntry = {
  id: string;
  account: { id: string; username: string; email: string | null };
  purchaseId: string | null;
  distributionId: string | null;
  entryType: string;
  direction: "credit" | "debit";
  amountMinor: string;
  currency: string;
  level: number | null;
  balanceState: string;
  settledAt: string | null;
  createdAt: string;
};
export type OperatorEarningsPage = {
  items: OperatorEarningsEntry[];
  nextCursor: string | null;
  totals: { pendingMinor: string; availableMinor: string; reservedMinor: string };
};
