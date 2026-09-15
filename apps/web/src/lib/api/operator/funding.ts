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
