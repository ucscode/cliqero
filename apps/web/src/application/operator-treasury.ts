import type { SqlExecutor } from "@/infrastructure/postgres/database";

type Cursor = { createdAt: string; id: string };

function encodeCursor(createdAt: string | Date, id: string) {
  return Buffer.from(
    JSON.stringify({ created_at: new Date(createdAt).toISOString(), id }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      created_at?: unknown;
      id?: unknown;
    };
    if (typeof parsed.created_at !== "string" || typeof parsed.id !== "string") throw new Error();
    const date = new Date(parsed.created_at);
    if (Number.isNaN(date.valueOf())) throw new Error();
    return { createdAt: date.toISOString(), id: parsed.id };
  } catch {
    throw new Error("Invalid pagination cursor");
  }
}

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
  actor: { id: string; handle: string; email: string } | null;
  createdAt: string;
};

export type OperatorTreasurySummary = {
  balanceMinor: string;
  creditsMinor: string;
  debitsMinor: string;
  currency: "USD";
};

export class OperatorTreasuryService {
  constructor(private readonly sql: SqlExecutor) {}

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
  }) {
    const cursor = decodeCursor(input.cursor);
    const search = cleanSearch(input.search);
    const sourceKind =
      input.source === "automatic" ? "distribution" : input.source === "manual" ? null : undefined;
    const values: unknown[] = [
      search,
      input.direction ?? null,
      sourceKind === undefined ? null : sourceKind,
    ];
    const conditions = [
      `($1::text is null or e.id::text=$1 or e.title ilike '%'||$1||'%' escape '\\' or e.note ilike '%'||$1||'%' escape '\\' or e.source_id::text=$1)`,
      `($2::text is null or e.direction=$2)`,
      `($3::text is null or ($3::text='distribution' and e.source_kind='distribution') or ($3::text is null and e.source_kind is null))`,
    ];
    if (input.source === "manual") conditions[2] = "e.source_kind is null";
    values.push(cursor?.createdAt ?? null, cursor?.id ?? null, input.limit + 1);
    const rows = (
      await this.sql.query<any>(
        `select e.id,e.direction,e.amount_minor,e.title,e.note,e.source_kind,e.source_id,e.created_at,
                a.id actor_id,a.handle actor_handle,a.email actor_email
           from treasury_capability.entries e
           left join identity_capability.accounts a on a.id=e.actor_id
          where ${conditions.join(" and ")}
            and ($4::timestamptz is null or (e.created_at,e.id)<($4::timestamptz,$5::uuid))
          order by e.created_at desc,e.id desc limit $6`,
        values,
      )
    ).rows;
    const visible = rows.slice(0, input.limit);
    return {
      items: visible.map(this.map),
      nextCursor:
        rows.length > input.limit
          ? encodeCursor(visible.at(-1).created_at, visible.at(-1).id)
          : null,
    };
  }

  async get(id: string): Promise<OperatorTreasuryEntry> {
    const row = (
      await this.sql.query<any>(
        `select e.id,e.direction,e.amount_minor,e.title,e.note,e.source_kind,e.source_id,e.created_at,
                a.id actor_id,a.handle actor_handle,a.email actor_email
           from treasury_capability.entries e
           left join identity_capability.accounts a on a.id=e.actor_id
          where e.id=$1`,
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
        ? { id: row.actor_id, handle: row.actor_handle, email: row.actor_email }
        : null,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
