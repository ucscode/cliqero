export type WithdrawalState =
  "requested" | "approved" | "rejected" | "cancelled" | "completed" | "failed";

export type Withdrawal = {
  id: string;
  amount_minor: string;
  currency: string;
  destination_type: "bank" | "manual";
  destination_summary: string;
  state: WithdrawalState;
  reason: string | null;
  created_at: string;
  updated_at: string;
};

export type WithdrawalPolicy = {
  enabled: boolean;
  minimum_amount_minor: string;
  maximum_amount_minor: string | null;
  currency: string;
};

export type WithdrawalReservation = {
  currency: string;
  reserved_minor: string;
  completed_minor: string;
};

export type WithdrawalPage = {
  withdrawals: Withdrawal[];
  available_minor: string;
  reservations: WithdrawalReservation[];
};

export type OperatorWithdrawalState = WithdrawalState;
export type OperatorWithdrawalAttention =
  "review" | "payout" | "reconciliation" | "retry" | "retry_wait" | "none";
export type OperatorWithdrawal = {
  id: string;
  account: { id: string; username: string; email: string | null };
  amountMinor: string;
  currency: string;
  destination: { type: "bank" | "manual"; summary: string };
  state: OperatorWithdrawalState;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  reservation: {
    amountMinor: string;
    currency: string;
    state: "reserved" | "released" | "completed";
  } | null;
  payout: {
    provider: string;
    state: "ready" | "submitted" | "succeeded" | "failed" | "unknown";
    attemptCount: number;
    nextAttemptAt: string | null;
    lastError: string | null;
    providerReference: string | null;
  } | null;
  attention: OperatorWithdrawalAttention;
};
export type OperatorWithdrawalPage = { items: OperatorWithdrawal[]; nextCursor: string | null };
export type OperatorWithdrawalDetail = OperatorWithdrawal & {
  attempts: Array<{
    id: string;
    number: number;
    provider: string;
    state: string;
    providerReference: string | null;
    failureCategory: string | null;
    failureReason: string | null;
    createdAt: string;
    completedAt: string | null;
  }>;
};
