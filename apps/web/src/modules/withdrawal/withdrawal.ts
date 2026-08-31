import type { Money } from "@/modules/money/money";
export type WithdrawalState =
  "requested" | "approved" | "rejected" | "cancelled" | "completed" | "failed";
export type DestinationType = "bank" | "manual";
export interface Withdrawal {
  id: string;
  accountId: string;
  amount: Money;
  destinationType: DestinationType;
  destinationReference: string;
  state: WithdrawalState;
  idempotencyKey: string;
  correlationId: string;
  reason?: string | null;
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
}
