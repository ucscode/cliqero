import { newId } from "@/kernel/ids";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type { EarningsAdjustmentRepository } from "@/modules/ledger/earnings-adjustments";

type Row = {
  id: string;
  account_id: string;
  username: string;
  amount_minor: string;
  reason: string;
  reference: string | null;
  created_by: string;
  created_at: Date | string;
  current_balance_minor?: string;
};

export class PostgresEarningsAdjustmentRepository implements EarningsAdjustmentRepository {
  constructor(private readonly sql: QueryExecutor) {}

  async lockIdempotencyKey(idempotencyKey: string) {
    await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `earnings-adjustment:${idempotencyKey}`,
    ]);
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    const row = (
      await this.sql.query<Row>(
        `select e.uuid id,a.uuid account_id,a.username,e.amount_minor,e.reason,e.reference,
                actor.uuid created_by,e.created_at
           from ledger_capability.earnings_adjustments e
           join identity_capability.accounts a on a.id=e.account_id
           join identity_capability.accounts actor on actor.id=e.created_by
          where e.idempotency_key=$1`,
        [idempotencyKey],
      )
    ).rows[0];
    return row ? this.project(row) : null;
  }

  async create(input: Parameters<EarningsAdjustmentRepository["create"]>[0]) {
    const row = (
      await this.sql.query<Row>(
        `with inserted as (
         insert into ledger_capability.earnings_adjustments(uuid,account_id,amount_minor,reason,reference,created_by,correlation_id,idempotency_key)
         values($1,(select id from identity_capability.accounts where uuid=$2),$3,$4,$5,
           (select id from identity_capability.accounts where uuid=$6),$7,$8)
         returning uuid id,account_id,amount_minor,reason,reference,created_by,created_at
       ) select i.id,a.uuid account_id,a.username,i.amount_minor,i.reason,i.reference,
                actor.uuid created_by,i.created_at
           from inserted i join identity_capability.accounts a on a.id=i.account_id
           join identity_capability.accounts actor on actor.id=i.created_by`,
        [
          newId(),
          input.accountId,
          input.amountMinor.toString(),
          input.reason,
          input.reference,
          input.actorId,
          input.correlationId ?? null,
          input.idempotencyKey,
        ],
      )
    ).rows[0];
    return this.project(row);
  }

  async list(input: { search?: string; cursor?: string; limit: number }) {
    const cursor = input.cursor ? this.decodeCursor(input.cursor) : null;
    const [rows, summary] = await Promise.all([
      this.sql.query<Row & { cursor_id: string }>(
        `select e.uuid id,e.id cursor_id,a.uuid account_id,a.username,e.amount_minor,e.reason,e.reference,
              actor.uuid created_by,e.created_at,
              ledger_capability.available_earnings_minor(a.id,'USD')::bigint current_balance_minor
         from ledger_capability.earnings_adjustments e
         join identity_capability.accounts a on a.id=e.account_id
         join identity_capability.accounts actor on actor.id=e.created_by
        where ($1::text is null or a.username ilike '%'||$1||'%' or e.reason ilike '%'||$1||'%' or e.reference ilike '%'||$1||'%')
          and ($2::timestamptz is null or (e.created_at,e.id)<($2::timestamptz,$3::bigint))
        order by e.created_at desc,e.id desc limit $4`,
        [
          input.search?.trim() || null,
          cursor?.createdAt ?? null,
          cursor?.id ?? null,
          input.limit + 1,
        ],
      ),
      this.sql.query<{ credit_minor: string; debit_minor: string; net_minor: string }>(
        `select coalesce(sum(amount_minor) filter (where amount_minor > 0),0)::text credit_minor,
                coalesce(-sum(amount_minor) filter (where amount_minor < 0),0)::text debit_minor,
                coalesce(sum(amount_minor),0)::text net_minor
           from ledger_capability.earnings_adjustments e
           join identity_capability.accounts a on a.id=e.account_id
          where ($1::text is null or a.username ilike '%'||$1||'%' or e.reason ilike '%'||$1||'%' or e.reference ilike '%'||$1||'%')`,
        [input.search?.trim() || null],
      ),
    ]);
    const visible = rows.rows.slice(0, input.limit);
    return {
      items: visible.map((row) => this.project(row)),
      nextCursor:
        rows.rows.length > input.limit
          ? Buffer.from(
              JSON.stringify({
                createdAt: String(visible.at(-1)!.created_at),
                id: visible.at(-1)!.cursor_id,
              }),
            ).toString("base64url")
          : null,
      summary: {
        creditMinor: summary.rows[0]?.credit_minor ?? "0",
        debitMinor: summary.rows[0]?.debit_minor ?? "0",
        netMinor: summary.rows[0]?.net_minor ?? "0",
      },
    };
  }

  async get(id: string) {
    const row = (
      await this.sql.query<Row>(
        `select e.uuid id,a.uuid account_id,a.username,e.amount_minor,e.reason,e.reference,actor.uuid created_by,e.created_at
         from ledger_capability.earnings_adjustments e
         join identity_capability.accounts a on a.id=e.account_id
         join identity_capability.accounts actor on actor.id=e.created_by where e.uuid=$1`,
        [id],
      )
    ).rows[0];
    return row ? this.project(row) : null;
  }

  async deleteForRoot(id: string, actorId: string) {
    const previous = await this.get(id);
    if (!previous) return false;
    await this.sql.query("select set_config('cliqero.root_delete','on',true)");
    const result = await this.sql.query(
      `delete from ledger_capability.earnings_adjustments where uuid=$1`,
      [id],
    );
    if ((result.rowCount ?? 0) !== 1) return false;
    await this.sql.query(
      `insert into kernel.audit_records(action,subject_type,subject_id,previous_state,new_state,correlation_id,actor_id)
       values('root.delete','earnings_adjustment',$1,$2::jsonb,null,$3::uuid,
              (select id from identity_capability.accounts where uuid=$4))`,
      [id, JSON.stringify(previous), newId(), actorId],
    );
    return true;
  }

  private project(row: Row) {
    return {
      id: row.id,
      accountId: row.account_id,
      accountUsername: row.username,
      amountMinor: String(row.amount_minor),
      reason: row.reason,
      reference: row.reference,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at).toISOString(),
      currentBalanceMinor:
        row.current_balance_minor == null ? null : String(row.current_balance_minor),
    };
  }

  private decodeCursor(value: string) {
    try {
      const data = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
      if (typeof data.createdAt !== "string" || !/^\d+$/.test(data.id)) throw new Error();
      return { createdAt: data.createdAt as string, id: data.id as string };
    } catch {
      throw new Error("Invalid earnings adjustment cursor");
    }
  }
}
