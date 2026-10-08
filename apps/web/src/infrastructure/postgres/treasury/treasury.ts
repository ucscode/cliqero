import type { QueryExecutor } from "../shared/database";
import type { TreasuryEntry, TreasuryRepository } from "@/modules/treasury/treasury";
import { newId } from "@/kernel/ids";
export class PostgresTreasuryRepository implements TreasuryRepository {
  constructor(private sql: QueryExecutor) {}
  async create(v: Parameters<TreasuryRepository["create"]>[0]) {
    if (v.direction === "debit") await this.lockBalance();
    const result = await this.sql.query(
      `insert into treasury_capability.entries(uuid,direction,amount_minor,title,note,source_kind,source_id,idempotency_key,actor_id,actor_kind,correlation_id,created_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,(select id from identity_capability.accounts where uuid=$9),$10,$11,$12)
       on conflict(idempotency_key) do nothing returning uuid as id,direction,amount_minor,title,note,source_kind,source_id,idempotency_key,
       (select uuid from identity_capability.accounts where id=actor_id) as actor_id,actor_kind,correlation_id,created_at`,
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
        v.actorKind,
        v.correlationId,
        v.createdAt,
      ],
    );
    if (result.rowCount === 0) {
      const existing = await this.findByIdempotencyKey(v.idempotencyKey);
      if (
        !existing ||
        existing.direction !== v.direction ||
        existing.amountMinor !== v.amountMinor ||
        existing.sourceKind !== v.sourceKind ||
        existing.sourceId !== v.sourceId ||
        existing.actorId !== v.actorId ||
        existing.actorKind !== v.actorKind ||
        existing.correlationId !== v.correlationId
      )
        throw new Error("Treasury idempotency key already used for a different entry");
      return existing;
    }
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

  async createAdjustment(v: Parameters<TreasuryRepository["createAdjustment"]>[0]) {
    if (v.amountMinor < 0n) await this.lockBalance();
    const adjustment = await this.sql.query<any>(
      `insert into treasury_capability.adjustments(uuid,amount_minor,reason,reference,created_by,idempotency_key,correlation_id,created_at)
       values($1,$2,$3,$4,(select id from identity_capability.accounts where uuid=$5),$6,coalesce($7::uuid,gen_random_uuid()),$8)
       on conflict(idempotency_key) do nothing returning uuid,correlation_id`,
      [
        v.id,
        v.amountMinor.toString(),
        v.reason,
        v.reference,
        v.actorId,
        v.idempotencyKey,
        v.correlationId,
        v.createdAt,
      ],
    );
    const adjustmentId = adjustment.rows[0]?.uuid;
    if (!adjustmentId) {
      const existing = (
        await this.sql.query<any>(
          `select adjustment.uuid,adjustment.amount_minor,adjustment.reason,adjustment.reference,
                adjustment.idempotency_key,adjustment.correlation_id,actor.uuid actor_uuid
           from treasury_capability.adjustments adjustment
           join identity_capability.accounts actor on actor.id=adjustment.created_by
          where adjustment.idempotency_key=$1`,
          [v.idempotencyKey],
        )
      ).rows[0];
      if (
        !existing ||
        BigInt(existing.amount_minor) !== v.amountMinor ||
        existing.reason !== v.reason ||
        existing.reference !== v.reference ||
        existing.actor_uuid !== v.actorId ||
        (v.correlationId != null && existing.correlation_id !== v.correlationId)
      )
        throw new Error(
          "Treasury adjustment idempotency key already used for a different adjustment",
        );
      const priorEntry = (
        await this.sql.query<any>(
          `select e.*,e.uuid as id,a.uuid as actor_id from treasury_capability.entries e
          left join identity_capability.accounts a on a.id=e.actor_id
         where e.source_kind='treasury_adjustment' and e.source_id=$1`,
          [existing.uuid],
        )
      ).rows[0];
      if (!priorEntry) throw new Error("Treasury adjustment ledger fact is unavailable");
      return { entry: map(priorEntry), created: false };
    }
    const direction = v.amountMinor > 0n ? "credit" : "debit";
    const amountMinor = v.amountMinor > 0n ? v.amountMinor : -v.amountMinor;
    const note = v.reference ? `${v.reason}\nReference: ${v.reference}` : v.reason;
    const result = await this.sql.query<any>(
      `insert into treasury_capability.entries(uuid,direction,amount_minor,title,note,source_kind,source_id,idempotency_key,actor_id,actor_kind,correlation_id,created_at)
       values($1,$2,$3,'Treasury adjustment',$4,'treasury_adjustment',$5,$6,
         (select id from identity_capability.accounts where uuid=$7),'operator',$8,$9)
       returning *,uuid as id,(select uuid from identity_capability.accounts where id=actor_id) as actor_id`,
      [
        newId(),
        direction,
        amountMinor.toString(),
        note,
        adjustmentId,
        `treasury-adjustment:${v.idempotencyKey}`,
        v.actorId,
        adjustment.rows[0]?.correlation_id,
        v.createdAt,
      ],
    );
    return { entry: map(result.rows[0]), created: true };
  }

  private async lockBalance() {
    await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      "treasury-balance",
    ]);
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
    correlationId: r.correlation_id ?? null,
    createdAt: r.created_at,
    actorKind: r.actor_kind ?? null,
  };
}
