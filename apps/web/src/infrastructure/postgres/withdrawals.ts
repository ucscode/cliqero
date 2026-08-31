import { Money } from "@/modules/money/money";
import type { SqlExecutor } from "./database";
import type {
  Withdrawal,
  WithdrawalRepository,
  WithdrawalPolicyRepository,
  WithdrawalPolicy,
  WithdrawalState,
} from "@/modules/withdrawal/withdrawal";
interface Row {
  id: string;
  account_id: string;
  amount_minor: string;
  currency: string;
  destination_type: "bank" | "manual";
  destination_reference: string;
  state: WithdrawalState;
  idempotency_key: string;
  correlation_id: string;
  reason: string | null;
  created_at: Date;
  updated_at: Date;
}
export class PostgresWithdrawalRepository implements WithdrawalRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async findById(id: string) {
    return this.find("id=$1", [id]);
  }
  async findByIdForUpdate(id: string) {
    return this.find("id=$1", [id], true);
  }
  async findByIdempotencyKey(key: string) {
    return this.find("idempotency_key=$1", [key]);
  }
  async listForAccount(accountId: string) {
    return this.list("account_id=$1", [accountId]);
  }
  async listForOperator(filter: { state?: WithdrawalState; limit?: number } = {}) {
    return this.list(
      filter.state ? "state=$1" : "true",
      filter.state ? [filter.state] : [],
      filter.limit ?? 100,
    );
  }
  async create(value: Withdrawal) {
    await this.sql.query(
      `insert into withdrawal_capability.withdrawals(id,account_id,amount_minor,currency,destination_type,destination_reference,state,idempotency_key,correlation_id,reason,created_at,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
      [
        value.id,
        value.accountId,
        value.amount.minorAmount.toString(),
        value.amount.currency,
        value.destinationType,
        value.destinationReference,
        value.state,
        value.idempotencyKey,
        value.correlationId,
        value.reason ?? null,
        value.createdAt,
      ],
    );
  }
  async transition(id: string, from: WithdrawalState, to: WithdrawalState, reason?: string) {
    const result = await this.sql.query(
      `update withdrawal_capability.withdrawals set state=$3,reason=coalesce($4,reason),updated_at=now(),approved_at=case when $3='approved' then now() else approved_at end,completed_at=case when $3='completed' then now() else completed_at end where id=$1 and state=$2`,
      [id, from, to, reason ?? null],
    );
    if (result.rowCount !== 1) throw new Error(`Invalid withdrawal transition from ${from}`);
  }
  private async find(where: string, values: readonly unknown[], lock = false) {
    const row = (
      await this.sql.query<Row>(
        `select id,account_id,amount_minor,currency,destination_type,destination_reference,state,idempotency_key,correlation_id,reason,created_at,updated_at from withdrawal_capability.withdrawals where ${where}${lock ? " for update" : ""}`,
        values,
      )
    ).rows[0];
    return row ? this.map(row) : null;
  }
  private async list(where: string, values: readonly unknown[], limit = 100) {
    const rows = (
      await this.sql.query<Row>(
        `select id,account_id,amount_minor,currency,destination_type,destination_reference,state,idempotency_key,correlation_id,reason,created_at,updated_at from withdrawal_capability.withdrawals where ${where} order by created_at desc,id desc limit $${values.length + 1}`,
        [...values, limit],
      )
    ).rows;
    return rows.map((row) => this.map(row));
  }
  private map(row: Row): Withdrawal {
    return {
      id: row.id,
      accountId: row.account_id,
      amount: Money.of(BigInt(row.amount_minor), row.currency),
      destinationType: row.destination_type,
      destinationReference: row.destination_reference,
      state: row.state,
      idempotencyKey: row.idempotency_key,
      correlationId: row.correlation_id,
      reason: row.reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
export class PostgresWithdrawalPolicyRepository implements WithdrawalPolicyRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async getActive(): Promise<WithdrawalPolicy> {
    const row = (
      await this.sql.query<{
        minimum_amount_minor: string;
        maximum_amount_minor: string | null;
        currency: string;
        enabled: boolean;
      }>(
        `select minimum_amount_minor,maximum_amount_minor,currency,enabled from withdrawal_capability.policy where singleton=true`,
      )
    ).rows[0];
    if (!row) throw new Error("Withdrawal policy is not configured");
    return {
      minimumAmount: Money.of(BigInt(row.minimum_amount_minor), row.currency),
      maximumAmount:
        row.maximum_amount_minor === null
          ? null
          : Money.of(BigInt(row.maximum_amount_minor), row.currency),
      enabled: row.enabled,
    };
  }
}
