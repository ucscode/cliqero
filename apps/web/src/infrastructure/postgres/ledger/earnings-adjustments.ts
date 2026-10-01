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
};

export class PostgresEarningsAdjustmentRepository implements EarningsAdjustmentRepository {
  constructor(private readonly sql: QueryExecutor) {}

  async create(input: Parameters<EarningsAdjustmentRepository["create"]>[0]) {
    const row = (
      await this.sql.query<Row>(
        `with inserted as (
         insert into ledger_capability.earnings_adjustments(uuid,account_id,amount_minor,reason,reference,created_by)
         values($1,(select id from identity_capability.accounts where uuid=$2),$3,$4,$5,
           (select id from identity_capability.accounts where uuid=$6))
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
        ],
      )
    ).rows[0];
    return this.project(row);
  }

  async list(input: { search?: string; cursor?: string; limit: number }) {
    const cursor = input.cursor ? this.decodeCursor(input.cursor) : null;
    const rows = (
      await this.sql.query<Row & { cursor_id: string }>(
        `select e.uuid id,e.id cursor_id,a.uuid account_id,a.username,e.amount_minor,e.reason,e.reference,
              actor.uuid created_by,e.created_at
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
      )
    ).rows;
    const visible = rows.slice(0, input.limit);
    return {
      items: visible.map((row) => this.project(row)),
      nextCursor:
        rows.length > input.limit
          ? Buffer.from(
              JSON.stringify({
                createdAt: String(visible.at(-1)!.created_at),
                id: visible.at(-1)!.cursor_id,
              }),
            ).toString("base64url")
          : null,
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
