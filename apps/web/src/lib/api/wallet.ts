export type WalletSummary = {
  currency: "USD";
  available_minor: string;
  pending_minor: string;
  active_fundings: ActiveFunding[];
};

export type ActiveFunding = {
  id: string;
  state: FundingStatus["state"];
  provider: string;
  provider_display_name?: string;
  funding_reference?: string;
  provider_transaction_id?: string | null;
  amount_minor: string;
  currency: string;
  authorization_url: string | null;
  payment_address: string | null;
  payment_amount: string | null;
  payment_currency: string | null;
  network: string | null;
  instructions: string | null;
  expires_at: string | null;
};

export type FundingPreparation = {
  provider: string;
  amount_minor: string;
  currency: string;
  collection_amount_minor: string;
  collection_currency: string;
  payment_currency: string | null;
  funding_options: Array<{
    id: string;
    collection_currency: string;
    fields: Array<{
      key: string;
      label: string;
      value: string;
      copyable?: boolean;
    }>;
  }>;
  conversion: {
    from_currency: string;
    to_currency: string;
    rate: string;
    observed_at: string;
  } | null;
};

export type WalletTransaction = {
  id: string;
  type: "funding_credit" | "purchase_debit";
  source_id: string;
  state: "pending" | "available" | "complete";
  amount_minor: string;
  currency: string;
  created_at: string;
  provider_display_name?: string | null;
  provider_reference?: string | null;
};

export type FundingStatus = {
  id: string;
  state:
    | "initialization_pending"
    | "initializing"
    | "awaiting_payment"
    | "verification_pending"
    | "confirmed"
    | "failed"
    | "blocked"
    | "cancelled"
    | "expired"
    | "reconciliation_pending";
  wallet_credit_state: "pending" | "available" | null;
  provider: string;
  provider_display_name: string;
  customer_action: string | null;
  funding_reference: string;
  provider_transaction_id: string | null;
  amount_minor: string;
  currency: string;
  collection_amount_minor: string;
  collection_currency: string;
  conversion: {
    from_currency: string;
    to_currency: string;
    rate: string;
    observed_at: string;
  } | null;
  provider_account_id: string | null;
  provider_account_snapshot: unknown;
  payment_address: string | null;
  payment_amount: string | null;
  payment_currency: string | null;
  asset: string | null;
  network: string | null;
  instructions: string | null;
  expires_at: string | null;
  error_code: string | null;
  error_message: string | null;
  verification: {
    status:
      | "awaiting_transaction"
      | "not_found"
      | "confirming"
      | "mismatch"
      | "failed"
      | "provider_error"
      | "success";
    level: "error" | "info" | "success";
    resolved: boolean;
    message: string;
    checked_at: string | null;
    confirmations?: number;
    confirmations_required?: number;
  } | null;
  authorization_url: string | null;
  confirmed_at: string | null;
  evidence: {
    id: string;
    transfer_reference: string | null;
    customer_note: string | null;
    proof: {
      original_filename: string | null;
      mime_type: string;
      byte_size: string;
    } | null;
    created_at: string;
  } | null;
};

export type FundingMethod = {
  id: string;
  display_name: string;
  image_url: string;
  description: string;
  test_only: "development" | "test" | null;
  collection_currencies: string[];
  payment_currencies: Array<{
    code: string;
    label?: string;
    asset?: string;
    network?: string;
  }>;
  customer_action?: string;
};
