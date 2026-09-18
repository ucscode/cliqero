import type { BankTransferConfirmationService } from "@/application/funding/bank-transfer/confirmation";

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

export type OperatorFundingOperation = {
  id: string;
  operation: string;
  outcome: "succeeded" | "failed";
  httpStatus: number | null;
  providerStatus: boolean | null;
  providerMessage: string | null;
  providerCode: string | null;
  failureKind: string | null;
  occurredAt: string;
};

export type OperatorFundingEvent = {
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
};

export type OperatorFundingSummary = {
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

export type OperatorFundingDetail = OperatorFundingSummary & {
  conversionSnapshot: {
    fromCurrency: string;
    toCurrency: string;
    rate: string;
    source: string;
    sourceDate: string;
    observedAt: string;
  } | null;
  providerInitialization: {
    authorizationUrl: string | null;
    providerAccountId?: string;
    providerAccountSnapshot?: unknown;
  } | null;
  operations: OperatorFundingOperation[];
  events: OperatorFundingEvent[];
  evidence: {
    id: string;
    transferReference: string | null;
    proof: {
      originalFilename: string | null;
      mimeType: string;
      byteSize: string;
    } | null;
    customerNote: string | null;
    createdAt: string;
  } | null;
};

export type OperatorFundingListInput = {
  search?: string;
  state?: OperatorFundingState;
  provider?: string;
  cursor?: string;
  limit: number;
};

export interface OperatorFundingReader {
  list(input: OperatorFundingListInput): Promise<{
    items: OperatorFundingSummary[];
    nextCursor: string | null;
  }>;
  get(id: string): Promise<OperatorFundingDetail>;
}

export class OperatorFundingService {
  constructor(
    private readonly reader: OperatorFundingReader,
    private readonly bankTransferConfirmation: BankTransferConfirmationService,
  ) {}

  list(input: OperatorFundingListInput) {
    return this.reader.list(input);
  }

  get(id: string) {
    return this.reader.get(id);
  }

  confirmBankTransfer(actorId: string, fundingId: string) {
    return this.bankTransferConfirmation.confirm(actorId, fundingId);
  }
}
