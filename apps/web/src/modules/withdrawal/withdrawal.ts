import type { Money } from "@/modules/money/money";
export type WithdrawalState =
  "requested" | "approved" | "rejected" | "cancelled" | "completed" | "failed";

export type DestinationField = {
  name: string;
  label: string;
  value: string;
  displayValue?: string;
  type: "text" | "select" | "textarea" | "fixed" | "hidden";
  copyable: boolean;
};

export type WithdrawalDestinationSnapshot = {
  savedDestinationId: string;
  method: string;
  methodName: string;
  name: string;
  fields: DestinationField[];
};

export type SavedWithdrawalDestination = {
  id: string;
  accountId: string;
  method: string;
  name: string;
  fields: DestinationField[];
  status: "active" | "archived";
  createdAt: Date;
  updatedAt: Date;
};

export interface Withdrawal {
  id: string;
  accountId: string;
  amount: Money;
  destination: WithdrawalDestinationSnapshot;
  state: WithdrawalState;
  idempotencyKey: string;
  correlationId: string;
  reason?: string | null;
  externalReference?: string | null;
  completionNote?: string | null;
  completedBy?: string | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface WithdrawalPolicy {
  minimumAmount: Money;
  maximumAmount: Money | null;
  enabled: boolean;
}
export interface WithdrawalPolicyRepository {
  getActive(): Promise<WithdrawalPolicy>;
}
export interface WithdrawalRepository {
  findById(id: string): Promise<Withdrawal | null>;
  findByIdForUpdate(id: string): Promise<Withdrawal | null>;
  findByIdempotencyKey(key: string): Promise<Withdrawal | null>;
  listForAccount(accountId: string): Promise<readonly Withdrawal[]>;
  listForOperator(filter?: {
    state?: WithdrawalState;
    limit?: number;
  }): Promise<readonly Withdrawal[]>;
  create(withdrawal: Withdrawal): Promise<void>;
  transition(
    id: string,
    from: WithdrawalState,
    to: WithdrawalState,
    reason?: string,
  ): Promise<void>;
  complete(
    id: string,
    actorId: string,
    externalReference: string | null,
    note: string | null,
  ): Promise<Date>;
}

export interface WithdrawalDestinationRepository {
  findById(id: string): Promise<SavedWithdrawalDestination | null>;
  listForAccount(accountId: string): Promise<readonly SavedWithdrawalDestination[]>;
  create(destination: SavedWithdrawalDestination): Promise<void>;
  update(destination: SavedWithdrawalDestination): Promise<void>;
}
