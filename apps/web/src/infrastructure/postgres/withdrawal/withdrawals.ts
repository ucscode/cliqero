import { Money } from "@/modules/money/money";
import type { QueryExecutor } from "../shared/database";
import type {
  Withdrawal,
  WithdrawalState,
  DestinationField,
  WithdrawalIdempotencyMatch,
  WithdrawalPayoutReturnRecord,
} from "@/modules/withdrawal/withdrawal";
import { WithdrawalRepository } from "@/modules/withdrawal/withdrawal";
interface Row {
  id: string;
  cursor_id?: string;
  cursor_created_at?: string;
  account_id: string;
  amount_minor: string;
  fee_minor: string;
  net_amount_minor: string;
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
export class PostgresWithdrawalRepository extends WithdrawalRepository {
  constructor(private readonly sql: QueryExecutor) {
    super();
  }
  async findById(id: string) {
    return this.find("w.uuid=$1", [id]);
  }
  async findByIdForUpdate(id: string) {
    return this.find("w.uuid=$1", [id], true);
  }
  async findByIdempotencyKey(
    accountId: string,
    key: string,
  ): Promise<WithdrawalIdempotencyMatch | null> {
    const row = (
      await this.sql.query<
        Row & {
          creation_state: "requested" | "approved" | "rejected";
          creation_reason: string | null;
        }
      >(
        `select w.uuid as id,(select uuid from identity_capability.accounts where id=w.account_id) as account_id,w.amount_minor,w.fee_minor,w.net_amount_minor,w.currency,w.saved_destination_id,w.destination_method,w.destination_method_name,w.destination_name,w.destination_details,w.state,w.idempotency_key,w.correlation_id,w.reason,w.external_reference,w.completion_note,(select uuid from identity_capability.accounts where id=w.completed_by) as completed_by,w.completed_at,w.created_at,w.updated_at,w.creation_state,w.creation_reason from withdrawal_capability.withdrawals w where w.account_id=(select id from identity_capability.accounts where uuid=$1) and w.idempotency_key=$2`,
        [accountId, key],
      )
    ).rows[0];
    return row
      ? {
          withdrawal: this.map(row),
          initialState: row.creation_state,
          initialReason: row.creation_reason,
        }
      : null;
  }
  async listForAccount(accountId: string, page: { cursor?: string; limit: number }) {
    const cursor = decodeAccountCursor(page.cursor);
    const rows = (
      await this.sql.query<Row>(
        `select w.uuid as id,w.id::text as cursor_id,w.created_at::text as cursor_created_at,(select uuid from identity_capability.accounts where id=w.account_id) as account_id,w.amount_minor,w.fee_minor,w.net_amount_minor,w.currency,w.saved_destination_id,w.destination_method,w.destination_method_name,w.destination_name,w.destination_details,w.state,w.idempotency_key,w.correlation_id,w.reason,w.external_reference,w.completion_note,(select uuid from identity_capability.accounts where id=w.completed_by) as completed_by,w.completed_at,w.created_at,w.updated_at
          from withdrawal_capability.withdrawals w
         where w.account_id=(select id from identity_capability.accounts where uuid=$1)
           and ($2::timestamptz is null or (w.created_at,w.id)<($2::timestamptz,$3::bigint))
         order by w.created_at desc,w.id desc limit $4`,
        [accountId, cursor?.createdAt ?? null, cursor?.id ?? null, page.limit + 1],
      )
    ).rows;
    const selected = rows.slice(0, page.limit);
    return {
      items: selected.map((row) => this.map(row)),
      nextCursor:
        rows.length > page.limit && selected.length
          ? encodeAccountCursor(
              selected[selected.length - 1].cursor_created_at!,
              selected[selected.length - 1].cursor_id!,
            )
          : null,
    };
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
      `insert into withdrawal_capability.withdrawals(uuid,account_id,amount_minor,fee_minor,net_amount_minor,currency,saved_destination_id,destination_method,destination_method_name,destination_name,destination_details,state,idempotency_key,correlation_id,reason,creation_state,creation_reason,created_at,updated_at) values($1,(select id from identity_capability.accounts where uuid=$2),$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$12,$15,$16,$16)`,
      [
        value.id,
        value.accountId,
        value.amount.minorAmount.toString(),
        value.fee?.minorAmount.toString() ?? "0",
        value.netAmount?.minorAmount.toString() ?? value.amount.minorAmount.toString(),
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
  async update(value: Withdrawal, expectedState: WithdrawalState = value.state) {
    const result = await this.sql.query(
      `update withdrawal_capability.withdrawals
          set amount_minor=$2,fee_minor=$3,net_amount_minor=$4,currency=$5,
              saved_destination_id=$6,destination_method=$7,destination_method_name=$8,
              destination_name=$9,destination_details=$10::jsonb,reason=$11,state=$12,
              approved_at=case when $12='approved' then coalesce(approved_at,now()) else approved_at end,
              updated_at=now()
        where uuid=$1 and state=$13`,
      [
        value.id,
        value.amount.minorAmount.toString(),
        value.fee?.minorAmount.toString() ?? "0",
        value.netAmount?.minorAmount.toString() ?? value.amount.minorAmount.toString(),
        value.amount.currency,
        value.destination.savedDestinationId,
        value.destination.method,
        value.destination.methodName,
        value.destination.name,
        JSON.stringify(value.destination.fields),
        value.reason ?? null,
        value.state,
        expectedState,
      ],
    );
    if (result.rowCount !== 1) throw new Error(`Invalid withdrawal update from ${expectedState}`);
  }
  async delete(id: string) {
    const result = await this.sql.query(
      `delete from withdrawal_capability.withdrawals where uuid=$1 and state in ('requested','rejected','cancelled','failed')`,
      [id],
    );
    if (result.rowCount !== 1)
      throw new Error("This withdrawal contains immutable payout history and cannot be deleted");
  }
  async deleteForRoot(id: string) {
    const result = await this.sql.query(
      `delete from withdrawal_capability.withdrawals where uuid=$1`,
      [id],
    );
    if (result.rowCount !== 1) throw new Error("Withdrawal not found");
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
  async recordPayoutReturn(input: {
    id: string;
    withdrawalId: string;
    amountMinor: bigint;
    restoredMinor: bigint;
    reason: string;
    externalReference: string;
    actorId: string;
    correlationId: string;
    idempotencyKey: string;
  }) {
    await this.sql.query(
      `insert into withdrawal_capability.payout_returns
        (uuid,withdrawal_id,amount_minor,restored_minor,reason,external_reference,actor_id,correlation_id,idempotency_key)
       values($1,(select id from withdrawal_capability.withdrawals where uuid=$2),$3,$4,$5,$6,
         (select id from identity_capability.accounts where uuid=$7),$8,$9)`,
      [
        input.id,
        input.withdrawalId,
        input.amountMinor.toString(),
        input.restoredMinor.toString(),
        input.reason,
        input.externalReference,
        input.actorId,
        input.correlationId,
        input.idempotencyKey,
      ],
    );
  }
  async findPayoutReturnByIdempotencyKey(
    key: string,
  ): Promise<WithdrawalPayoutReturnRecord | null> {
    return this.findPayoutReturn("r.idempotency_key=$1", [key]);
  }
  async findPayoutReturnByWithdrawalId(id: string): Promise<WithdrawalPayoutReturnRecord | null> {
    return this.findPayoutReturn("w.uuid=$1", [id]);
  }
  async lockPayoutReturnKey(key: string) {
    await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `payout-return:${key}`,
    ]);
  }
  private async findPayoutReturn(where: string, values: readonly unknown[]) {
    const row = (
      await this.sql.query<{
        id: string;
        withdrawal_id: string;
        amount_minor: string;
        restored_minor: string;
        reason: string;
        external_reference: string;
        actor_id: string;
        correlation_id: string;
        idempotency_key: string;
      }>(
        `select r.uuid id,w.uuid withdrawal_id,r.amount_minor,r.restored_minor,r.reason,
                r.external_reference,a.uuid actor_id,r.correlation_id,r.idempotency_key
           from withdrawal_capability.payout_returns r
           join withdrawal_capability.withdrawals w on w.id=r.withdrawal_id
           join identity_capability.accounts a on a.id=r.actor_id
          where ${where}`,
        values,
      )
    ).rows[0];
    return row
      ? {
          id: row.id,
          withdrawalId: row.withdrawal_id,
          amountMinor: BigInt(row.amount_minor),
          restoredMinor: BigInt(row.restored_minor),
          reason: row.reason,
          externalReference: row.external_reference,
          actorId: row.actor_id,
          correlationId: row.correlation_id,
          idempotencyKey: row.idempotency_key,
        }
      : null;
  }
  async markPayoutReturned(id: string, reason: string) {
    const result = await this.sql.query(
      `update withdrawal_capability.withdrawals
          set state='failed',reason=$2,updated_at=now()
        where uuid=$1 and state='completed'`,
      [id, reason],
    );
    if (result.rowCount !== 1) throw new Error("Only a completed withdrawal can be returned");
  }
  private async find(where: string, values: readonly unknown[], lock = false) {
    const row = (
      await this.sql.query<Row>(
        `select w.uuid as id,(select uuid from identity_capability.accounts where id=w.account_id) as account_id,w.amount_minor,w.fee_minor,w.net_amount_minor,w.currency,w.saved_destination_id,w.destination_method,w.destination_method_name,w.destination_name,w.destination_details,w.state,w.idempotency_key,w.correlation_id,w.reason,w.external_reference,w.completion_note,(select uuid from identity_capability.accounts where id=w.completed_by) as completed_by,w.completed_at,w.created_at,w.updated_at from withdrawal_capability.withdrawals w where ${where}${lock ? " for update" : ""}`,
        values,
      )
    ).rows[0];
    return row ? this.map(row) : null;
  }
  private async list(where: string, values: readonly unknown[], limit = 100) {
    const rows = (
      await this.sql.query<Row>(
        `select w.uuid as id,(select uuid from identity_capability.accounts where id=w.account_id) as account_id,w.amount_minor,w.fee_minor,w.net_amount_minor,w.currency,w.saved_destination_id,w.destination_method,w.destination_method_name,w.destination_name,w.destination_details,w.state,w.idempotency_key,w.correlation_id,w.reason,w.external_reference,w.completion_note,(select uuid from identity_capability.accounts where id=w.completed_by) as completed_by,w.completed_at,w.created_at,w.updated_at from withdrawal_capability.withdrawals w where ${where} order by w.created_at desc,w.id desc limit $${values.length + 1}`,
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
      fee: Money.of(BigInt(row.fee_minor ?? "0"), row.currency),
      netAmount: Money.of(BigInt(row.net_amount_minor ?? row.amount_minor), row.currency),
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

function encodeAccountCursor(createdAt: string, id: string) {
  return Buffer.from(JSON.stringify({ created_at: createdAt, id }), "utf8").toString("base64url");
}

function decodeAccountCursor(value?: string) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      created_at?: unknown;
      id?: unknown;
    };
    if (
      typeof parsed.created_at !== "string" ||
      typeof parsed.id !== "string" ||
      !/^\d+$/.test(parsed.id)
    )
      throw new Error();
    if (Number.isNaN(Date.parse(parsed.created_at))) throw new Error();
    return { createdAt: parsed.created_at, id: parsed.id };
  } catch {
    throw new Error("Invalid withdrawal history cursor");
  }
}
