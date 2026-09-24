import { Money } from "@/modules/money/money";
import type { QueryExecutor } from "../shared/database";
import type {
  Withdrawal,
  WithdrawalRepository,
  WithdrawalPolicyRepository,
  WithdrawalPolicy,
  WithdrawalState,
  DestinationField,
} from "@/modules/withdrawal/withdrawal";
interface Row {
  id: string;
  account_id: string;
  amount_minor: string;
  currency: string;
  saved_destination_id: string;
  destination_method: string;
  destination_method_name: string;
  destination_name: string;
  destination_details: DestinationField[];
  state: WithdrawalState;
  idempotency_key: string;
  correlation_id: string;
  reason: string | null;
  external_reference: string | null;
  completion_note: string | null;
  completed_by: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
export class PostgresWithdrawalRepository implements WithdrawalRepository {
  constructor(private readonly sql: QueryExecutor) {}
  async findById(id: string) {
    return this.find("w.uuid=$1", [id]);
  }
  async findByIdForUpdate(id: string) {
    return this.find("w.uuid=$1", [id], true);
  }
  async findByIdempotencyKey(key: string) {
    return this.find("idempotency_key=$1", [key]);
  }
  async listForAccount(accountId: string) {
    return this.list("account_id=(select id from identity_capability.accounts where uuid=$1)", [
      accountId,
    ]);
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
      `insert into withdrawal_capability.withdrawals(uuid,account_id,amount_minor,currency,saved_destination_id,destination_method,destination_method_name,destination_name,destination_details,state,idempotency_key,correlation_id,reason,created_at,updated_at) values($1,(select id from identity_capability.accounts where uuid=$2),$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$14)`,
      [
        value.id,
        value.accountId,
        value.amount.minorAmount.toString(),
        value.amount.currency,
        value.destination.savedDestinationId,
        value.destination.method,
        value.destination.methodName,
        value.destination.name,
        JSON.stringify(value.destination.fields),
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
      `update withdrawal_capability.withdrawals set state=$3,reason=coalesce($4,reason),updated_at=now(),approved_at=case when $3='approved' then now() else approved_at end,completed_at=case when $3='completed' then now() else completed_at end where uuid=$1 and state=$2`,
      [id, from, to, reason ?? null],
    );
    if (result.rowCount !== 1) throw new Error(`Invalid withdrawal transition from ${from}`);
  }
  async complete(
    id: string,
    actorId: string,
    externalReference: string | null,
    note: string | null,
  ) {
    const result = await this.sql.query<{ completed_at: Date }>(
      `update withdrawal_capability.withdrawals
          set state='completed',external_reference=$2,completion_note=$3,
              completed_by=(select id from identity_capability.accounts where uuid=$4),
              completed_at=now(),updated_at=now()
        where uuid=$1 and state='approved' returning completed_at`,
      [id, externalReference, note, actorId],
    );
    if (result.rowCount !== 1) throw new Error("Invalid withdrawal transition from approved");
    return result.rows[0].completed_at;
  }
  private async find(where: string, values: readonly unknown[], lock = false) {
    const row = (
      await this.sql.query<Row>(
        `select w.uuid as id,(select uuid from identity_capability.accounts where id=w.account_id) as account_id,w.amount_minor,w.currency,w.saved_destination_id,w.destination_method,w.destination_method_name,w.destination_name,w.destination_details,w.state,w.idempotency_key,w.correlation_id,w.reason,w.external_reference,w.completion_note,(select uuid from identity_capability.accounts where id=w.completed_by) as completed_by,w.completed_at,w.created_at,w.updated_at from withdrawal_capability.withdrawals w where ${where}${lock ? " for update" : ""}`,
        values,
      )
    ).rows[0];
    return row ? this.map(row) : null;
  }
  private async list(where: string, values: readonly unknown[], limit = 100) {
    const rows = (
      await this.sql.query<Row>(
        `select w.uuid as id,(select uuid from identity_capability.accounts where id=w.account_id) as account_id,w.amount_minor,w.currency,w.saved_destination_id,w.destination_method,w.destination_method_name,w.destination_name,w.destination_details,w.state,w.idempotency_key,w.correlation_id,w.reason,w.external_reference,w.completion_note,(select uuid from identity_capability.accounts where id=w.completed_by) as completed_by,w.completed_at,w.created_at,w.updated_at from withdrawal_capability.withdrawals w where ${where} order by w.created_at desc,w.id desc limit $${values.length + 1}`,
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
      destination: {
        savedDestinationId: row.saved_destination_id,
        method: row.destination_method,
        methodName: row.destination_method_name,
        name: row.destination_name,
        fields: row.destination_details,
      },
      state: row.state,
      idempotencyKey: row.idempotency_key,
      correlationId: row.correlation_id,
      reason: row.reason,
      externalReference: row.external_reference,
      completionNote: row.completion_note,
      completedBy: row.completed_by,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
export class PostgresWithdrawalPolicyRepository implements WithdrawalPolicyRepository {
  constructor(private readonly sql: QueryExecutor) {}
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
