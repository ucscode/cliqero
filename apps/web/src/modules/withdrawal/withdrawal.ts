import type { Money } from "@/modules/money/money";
import { CrudRepository } from "@/kernel/crud";
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
  /** Gross requested/reserved amount, separate from immutable fee and net snapshots. */
  fee?: Money;
  netAmount?: Money;
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
export interface WithdrawalPolicySource {
  getActive(): Promise<WithdrawalPolicy>;
}
export abstract class WithdrawalRepository extends CrudRepository<
  [withdrawal: Withdrawal],
  [id: string],
  [withdrawal: Withdrawal, expectedState?: WithdrawalState],
  [id: string],
  Promise<void>,
  Promise<Withdrawal | null>,
  Promise<void>,
  Promise<void>
> {
  abstract findByIdForUpdate(id: string): Promise<Withdrawal | null>;
  abstract findByIdempotencyKey(accountId: string, key: string): Promise<Withdrawal | null>;
  abstract listForAccount(
    accountId: string,
    page: { cursor?: string; limit: number },
  ): Promise<{ items: readonly Withdrawal[]; nextCursor: string | null }>;
  abstract listForOperator(filter?: {
    state?: WithdrawalState;
    limit?: number;
  }): Promise<readonly Withdrawal[]>;
  abstract create(withdrawal: Withdrawal): Promise<void>;
  abstract findById(id: string): Promise<Withdrawal | null>;
  abstract update(withdrawal: Withdrawal, expectedState?: WithdrawalState): Promise<void>;
  abstract delete(id: string): Promise<void>;
  abstract deleteForRoot(id: string): Promise<void>;
  abstract complete(
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
