export type WithdrawalState =
  | "requested"
  | "approved"
  | "rejected"
  | "cancelled"
  | "completed"
  | "failed";

export type Withdrawal = {
  id: string;
  amount_minor: string;
  currency: string;
  destination: { method: string; method_name: string; name: string };
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
    state: "reserved" | "released" | "completed";
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
export type WithdrawalFieldAttributes = Record<string, string | number | boolean>;
export type WithdrawalSelectOption = { key: string; value: string };

type WithdrawalEditableField = WithdrawalFieldIdentity & {
  required: boolean;
  copyable?: boolean;
  placeholder?: string;
  attributes?: WithdrawalFieldAttributes;
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
      copyable?: boolean;
    });
export type WithdrawalMethod = {
  id: string;
  display_name: string;
  image_url: string;
  description: string;
  fields: WithdrawalMethodField[];
};
export type WithdrawalDestinationField = {
  name: string;
  label: string;
  value: string;
  displayValue?: string;
  type: "text" | "select" | "textarea" | "fixed";
  copyable: boolean;
};
export type WithdrawalDestination = {
  id: string;
  method: { id: string; display_name: string; image_url: string | null; available: boolean };
  name: string;
  fields: WithdrawalDestinationField[];
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
};
