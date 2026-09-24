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
