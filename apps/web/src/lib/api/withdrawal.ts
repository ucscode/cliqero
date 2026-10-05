export type WithdrawalState =
  "requested" | "approved" | "rejected" | "cancelled" | "completed" | "failed";

export type Withdrawal = {
  id: string;
  amount_minor: string;
  fee_minor: string;
  net_amount_minor: string;
  currency: string;
  destination: { method: string; method_name: string; name: string };
  state: WithdrawalState;
  reason: string | null;
  created_at: string;
  updated_at: string;
  account: { id: string; username: string; email: string | null } | null;
  reservation: {
    amount_minor: string;
    currency: string;
    state: "reserved" | "released" | "completed" | "returned";
  } | null;
  external_reference: string | null;
  completion_note: string | null;
  completed_by: string | null;
  completed_at: string | null;
  payout_return: {
    id: string;
    amount_minor: string;
    restored_minor: string;
    reason: string;
    external_reference: string;
    actor_id: string;
    correlation_id: string;
    idempotency_key: string;
    created_at: string;
  } | null;
  attention: "review" | "action_required" | "none" | null;
  payout_details: { saved_destination_id: string; fields: WithdrawalDestinationField[] } | null;
};

export type WithdrawalPolicy = {
  enabled: boolean;
  minimum_amount_minor: string;
  maximum_amount_minor: string | null;
  currency: string;
  fee_enabled: boolean;
  fee_basis_points: string;
  fee_maximum_amount_minor: string | null;
};

export type WithdrawalReservation = {
  currency: string;
  reserved_minor: string;
  completed_minor: string;
};

export type WithdrawalPage = {
  items: Withdrawal[];
  next_cursor: string | null;
  wallet_summary: { available_minor: string; reservations: WithdrawalReservation[] } | null;
};

export type OperatorWithdrawalState = WithdrawalState;
export type OperatorWithdrawalAttention = "review" | "action_required" | "none";
export type OperatorWithdrawal = {
  id: string;
  account: { id: string; username: string; email: string | null };
  amountMinor: string;
  currency: string;
  destination: { method: string; methodName: string; name: string };
  state: OperatorWithdrawalState;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  reservation: {
    amountMinor: string;
    currency: string;
    state: "reserved" | "released" | "completed" | "returned";
  } | null;
  externalReference: string | null;
  completionNote: string | null;
  completedBy: string | null;
  completedAt: string | null;
  attention: OperatorWithdrawalAttention;
};
export type OperatorWithdrawalPage = { items: OperatorWithdrawal[]; nextCursor: string | null };
export type OperatorWithdrawalDetail = Omit<OperatorWithdrawal, "destination"> & {
  destination: OperatorWithdrawal["destination"] & {
    savedDestinationId: string;
    fields: WithdrawalDestinationField[];
  };
};

type WithdrawalFieldIdentity = {
  name: string;
  label: string;
};
export type WithdrawalFieldAttrs = Record<string, string | number | boolean>;
export type WithdrawalSelectOption = { key: string; label: string };

type WithdrawalEditableField = WithdrawalFieldIdentity & {
  description?: string;
  required: boolean;
  copyable?: boolean;
  attrs?: WithdrawalFieldAttrs;
};

export type WithdrawalMethodField =
  | (WithdrawalEditableField & {
      type: "text";
      regex?: string;
      enum?: string[];
    })
  | (WithdrawalEditableField & {
      type: "select";
      options: WithdrawalSelectOption[];
    })
  | (WithdrawalEditableField & {
      type: "textarea";
      regex?: string;
      enum?: string[];
    })
  | (WithdrawalFieldIdentity & {
      type: "fixed";
      value: string;
      description?: string;
      copyable?: boolean;
    })
  | (WithdrawalFieldIdentity & {
      type: "hidden";
      value: string;
      description?: string;
      copyable?: boolean;
    });
export type WithdrawalMethod = {
  id: string;
  display_name: string;
  description: string;
  fields: WithdrawalMethodField[];
};
export type WithdrawalDestinationField = {
  name: string;
  label: string;
  value: string;
  displayValue?: string;
  type: "text" | "select" | "textarea" | "fixed" | "hidden";
  copyable: boolean;
};
export type WithdrawalDestination = {
  id: string;
  method: { id: string; display_name: string; available: boolean };
  name: string;
  fields: WithdrawalDestinationField[];
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
};
