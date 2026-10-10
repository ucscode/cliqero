export type EarningsBalance = {
  currency: string;
  state: string;
  amount_minor: string;
};

export type WithdrawableBalance = {
  currency: string;
  amount_minor: string;
};

export type EarningsSummary = {
  balances: EarningsBalance[];
  withdrawal_currency: string;
  withdrawable_balances: WithdrawableBalance[];
  reconciliation: {
    available_minor: string;
    purchase_earnings_minor: string;
    purchase_reversals_minor: string;
    earnings_corrections_minor: string;
    manual_adjustments_minor: string;
    balance_transfers_minor: string;
    funding_reversals_minor: string;
    transfer_compensations_minor: string;
    debt_settlements_minor: string;
    withdrawal_reserved_minor: string;
    completed_withdrawals_minor: string;
    settled_purchase_earnings_minor: string;
  };
};

export type EarningsEntry = {
  id: string;
  purchase_id: string | null;
  entry_type: string;
  direction: "credit" | "debit";
  amount_minor: string;
  currency: string;
  recipient_role: string | null;
  balance_state: string;
  source?: "generated" | "adjustment" | "funding_reversal" | "wallet_transfer_compensation";
  reason?: string | null;
  reference?: string | null;
  created_at: string;
};

export type EarningsEntryPage = {
  items: EarningsEntry[];
  nextCursor: string | null;
};

export type Profile = {
  id: string;
  email: string;
  username: string;
  country: string | null;
};

export type AccountAccess = {
  accountId: string;
  capabilities: string[];
  canAccessOperator: boolean;
};

export type OperatorOverview = {
  capabilities: string[];
  catalogue: { published: number; draft: number; archived: number };
  users?: { total: number };
  commerce?: { purchases: number };
  withdrawals?: { requested: number; approved: number };
};
