import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import { decodeOperatorSortCursor, encodeOperatorSortCursor } from "./cursor";

function cleanSearch(value?: string) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.replace(/[\\%_]/g, "\\$&") : null;
}

export type OperatorTreasuryEntry = {
  id: string;
  direction: "credit" | "debit";
  amountMinor: string;
  title: string;
  note: string | null;
  source: { kind: string; id: string } | null;
  actor: { id: string; username: string; email: string | null } | null;
  createdAt: string;
};

export type OperatorTreasurySummary = {
  balanceMinor: string;
  creditsMinor: string;
  debitsMinor: string;
  currency: "USD";
};

export class OperatorTreasuryService {
  constructor(private readonly sql: QueryExecutor) {}

  async summary(): Promise<OperatorTreasurySummary> {
    const row = (
      await this.sql.query<any>(
        `select coalesce(sum(amount_minor) filter(where direction='credit'),0)::bigint credits,
                coalesce(sum(amount_minor) filter(where direction='debit'),0)::bigint debits
           from treasury_capability.entries`,
      )
    ).rows[0];
    const credits = BigInt(row?.credits ?? 0);
    const debits = BigInt(row?.debits ?? 0);
    return {
      balanceMinor: (credits - debits).toString(),
      creditsMinor: credits.toString(),
      debitsMinor: debits.toString(),
      currency: "USD",
    };
  }

  async list(input: {
    search?: string;
    direction?: "credit" | "debit";
    source?: "automatic" | "manual";
    cursor?: string;
    limit: number;
    sort?: "created" | "amount";
    sort_direction?: "asc" | "desc";
  }) {
    const sort = input.sort ?? "created";
    const direction = input.sort_direction ?? "desc";
    const cursor = decodeOperatorSortCursor(input.cursor, sort, direction);
    const orderBy = sort === "amount" ? "e.amount_minor" : "e.created_at";
    const cursorType = sort === "amount" ? "bigint" : "timestamptz";
    const search = cleanSearch(input.search);
    const sourceKind =
      input.source === "automatic" ? "distribution" : input.source === "manual" ? null : undefined;
    const values: unknown[] = [
      search,
      input.direction ?? null,
      sourceKind === undefined ? null : sourceKind,
    ];
    const conditions = [
      `($1::text is null or e.uuid::text=$1 or e.title ilike '%'||$1||'%' escape '\\' or e.note ilike '%'||$1||'%' escape '\\' or e.source_id::text=$1)`,
      `($2::text is null or e.direction=$2)`,
      `($3::text is null or ($3::text='automatic' and e.source_kind is not null) or ($3::text='manual' and e.source_kind is null))`,
    ];
    const cursorClause = cursor
      ? `and (${orderBy},e.id) ${direction === "asc" ? ">" : "<"} ($4::${cursorType},$5::bigint)`
      : "";
    if (cursor) values.push(cursor.value, cursor.id);
    values.push(input.limit + 1);
    const rows = (
      await this.sql.query<any>(
        `select e.uuid as id,e.id::text cursor_id,${orderBy}::text cursor_sort_value,e.direction,e.amount_minor,e.title,e.note,e.source_kind,e.source_id,e.created_at,
                a.uuid actor_id,a.username actor_username,a.email actor_email
           from treasury_capability.entries e
           left join identity_capability.account_profiles a on a.id=e.actor_id
          where ${conditions.join(" and ")}
            ${cursorClause}
          order by ${orderBy} ${direction},e.id ${direction} limit $${values.length}`,
        values,
      )
    ).rows;
    const visible = rows.slice(0, input.limit);
    return {
      items: visible.map(this.map),
      nextCursor:
        rows.length > input.limit
          ? encodeOperatorSortCursor({
              sort,
              direction,
              value: String(visible.at(-1).cursor_sort_value),
              id: String(visible.at(-1).cursor_id),
            })
          : null,
    };
  }

  async get(id: string): Promise<OperatorTreasuryEntry> {
    const row = (
      await this.sql.query<any>(
        `select e.uuid as id,e.direction,e.amount_minor,e.title,e.note,e.source_kind,e.source_id,e.created_at,
                a.uuid actor_id,a.username actor_username,a.email actor_email
           from treasury_capability.entries e
           left join identity_capability.account_profiles a on a.id=e.actor_id
          where e.uuid=$1`,
        [id],
      )
    ).rows[0];
    if (!row) throw new Error("Treasury entry not found");
    return this.map(row);
  }

  private map(row: any): OperatorTreasuryEntry {
    return {
      id: row.id,
      direction: row.direction,
      amountMinor: String(row.amount_minor),
      title: row.title,
      note: row.note ?? null,
      source:
        row.source_kind && row.source_id ? { kind: row.source_kind, id: row.source_id } : null,
      actor: row.actor_id
        ? { id: row.actor_id, username: row.actor_username, email: row.actor_email }
        : null,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
