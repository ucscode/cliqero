export type OperatorAccountSummary = {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  country: string | null;
  createdAt: string;
  directReferralCount: number;
};

export type OperatorAccountDetail = OperatorAccountSummary & {
  parent: { id: string; username: string; displayName: string | null } | null;
  purchaseCount: number;
  latestParentReassignment: {
    actorId: string | null;
    previousParentId: string | null;
    parentId: string | null;
    occurredAt: string;
  } | null;
};

export type OperatorFundingState =
  | "initialization_pending"
  | "initializing"
  | "awaiting_payment"
  | "verification_pending"
  | "confirmed"
  | "failed"
  | "blocked"
  | "expired"
  | "reconciliation_pending";

export type OperatorFundingWalletCredit = {
  id: string;
  amountMinor: string;
  currency: string;
  state: "pending" | "available";
  createdAt: string;
  availableAt: string | null;
};

export type OperatorFunding = {
  id: string;
  account: { id: string; username: string; email: string | null };
  provider: string;
  providerReference: string;
  providerTransactionId: string | null;
  canonicalAmountMinor: string;
  canonicalCurrency: "USD";
  collectionAmountMinor: string;
  collectionCurrency: string;
  state: OperatorFundingState;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  walletCredit: OperatorFundingWalletCredit | null;
};

export type OperatorFundingPage = { items: OperatorFunding[]; nextCursor: string | null };

export type OperatorFundingDetail = OperatorFunding & {
  conversionSnapshot: {
    fromCurrency: string;
    toCurrency: string;
    rate: string;
    source: string;
    sourceDate: string;
    observedAt: string;
  } | null;
  providerInitialization: { authorizationUrl: string | null } | null;
  operations: Array<{
    id: string;
    operation: string;
    outcome: "succeeded" | "failed";
    httpStatus: number | null;
    providerStatus: boolean | null;
    providerMessage: string | null;
    providerCode: string | null;
    failureKind: string | null;
    occurredAt: string;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    providerReference: string | null;
    amountMinor: string | null;
    currency: string | null;
    state: "received" | "processed" | "rejected" | "ignored";
    lastError: string | null;
    receivedAt: string;
    processedAt: string | null;
    outboxState: string | null;
    outboxLastError: string | null;
  }>;
};

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

export type OperatorTreasurySummary = {
  balanceMinor: string;
  creditsMinor: string;
  debitsMinor: string;
  currency: "USD";
};

export type OperatorTreasuryEntry = {
  id: string;
  direction: "credit" | "debit";
  amountMinor: string;
  title: string;
  note: string | null;
  source: { kind: string; id: string } | null;
  actor: { id: string; username: string; email: string | null } | null;
  createdAt: string;
};

export type OperatorTreasuryPage = {
  items: OperatorTreasuryEntry[];
  nextCursor: string | null;
};

export type OperatorAccountPage = {
  items: OperatorAccountSummary[];
  nextCursor: string | null;
};

export type CapabilityAssignment = {
  capability: string;
  grantedAt: string;
};

export type CapabilityAdministrationView = {
  accountId: string;
  assignments: CapabilityAssignment[];
  manageableCapabilities: string[];
  isSelf: boolean;
};
