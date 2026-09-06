import type { SqlExecutor } from "./database";
import type { TreasuryEntry, TreasuryRepository } from "@/modules/treasury/treasury";
export class PostgresTreasuryRepository implements TreasuryRepository {
  constructor(private sql: SqlExecutor) {}
  async create(v: TreasuryEntry) {
    const result = await this.sql.query(
      `insert into treasury_capability.entries(uuid,direction,amount_minor,title,note,source_kind,source_id,idempotency_key,actor_id,created_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,(select id from identity_capability.accounts where uuid=$9),$10)
       on conflict(idempotency_key) do nothing returning uuid as id,direction,amount_minor,title,note,source_kind,source_id,idempotency_key,
       (select uuid from identity_capability.accounts where id=actor_id) as actor_id,created_at`,
      [
        v.id,
        v.direction,
        v.amountMinor.toString(),
        v.title,
        v.note,
        v.sourceKind,
        v.sourceId,
        v.idempotencyKey,
        v.actorId,
        v.createdAt,
      ],
    );
    if (result.rowCount === 0) return (await this.findByIdempotencyKey(v.idempotencyKey))!;
    return map(result.rows[0]);
  }
  async findById(id: string) {
    const row = (
      await this.sql.query<any>(
        `select e.*, e.uuid as id, a.uuid as actor_id from treasury_capability.entries e left join identity_capability.accounts a on a.id=e.actor_id where e.uuid=$1`,
        [id],
      )
    ).rows[0];
    return row ? map(row) : null;
  }
  async findByIdempotencyKey(key: string) {
    const row = (
      await this.sql.query<any>(
        `select e.*, e.uuid as id, a.uuid as actor_id from treasury_capability.entries e left join identity_capability.accounts a on a.id=e.actor_id where e.idempotency_key=$1`,
        [key],
      )
    ).rows[0];
    return row ? map(row) : null;
  }
  async list(input: { cursor?: string; limit: number; direction?: "credit" | "debit" }) {
    const values: any[] = [];
    const where: string[] = [];
    if (input.direction) {
      values.push(input.direction);
      where.push(`direction=$${values.length}`);
    }
    if (input.cursor) {
      values.push(input.cursor);
      where.push(
        `(e.created_at,e.id)<(select created_at,id from treasury_capability.entries where uuid=$${values.length})`,
      );
    }
    values.push(input.limit + 1);
    const rows = (
      await this.sql.query<any>(
        `select e.*, e.uuid as id, e.id as relational_id, a.uuid as actor_id
           from treasury_capability.entries e
           left join identity_capability.accounts a on a.id=e.actor_id
          ${where.length ? `where ${where.join(" and ")}` : ""}
          order by e.created_at desc,e.id desc limit $${values.length}`,
        values,
      )
    ).rows;
    const items = rows.slice(0, input.limit).map(map);
    return { items, nextCursor: rows.length > input.limit ? items.at(-1)!.id : null };
  }
  async summary() {
    const row = (
      await this.sql.query<any>(
        `select coalesce(sum(amount_minor) filter(where direction='credit'),0)::bigint credits,coalesce(sum(amount_minor) filter(where direction='debit'),0)::bigint debits from treasury_capability.entries`,
      )
    ).rows[0];
    const credits = BigInt(row.credits),
      debits = BigInt(row.debits);
    return { creditsMinor: credits, debitsMinor: debits, balanceMinor: credits - debits };
  }
}
function map(r: any): TreasuryEntry {
  return {
    id: r.id,
    direction: r.direction,
    amountMinor: BigInt(r.amount_minor),
    title: r.title,
    note: r.note,
    sourceKind: r.source_kind,
    sourceId: r.source_id,
    idempotencyKey: r.idempotency_key,
    actorId: r.actor_id,
    createdAt: r.created_at,
  };
}
