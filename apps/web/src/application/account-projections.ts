import type { SqlExecutor } from "@/infrastructure/postgres/database";

type ProjectionCursor = { createdAt: string; id: string };

function encodeCursor(createdAt: string | Date, id: string) {
  return Buffer.from(
    JSON.stringify({ created_at: new Date(createdAt).toISOString(), id }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(value: string | undefined): ProjectionCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      created_at?: unknown;
      id?: unknown;
    };
    if (typeof parsed.created_at !== "string" || typeof parsed.id !== "string") throw new Error();
    const createdAt = new Date(parsed.created_at);
    if (Number.isNaN(createdAt.valueOf())) throw new Error();
    return { createdAt: createdAt.toISOString(), id: parsed.id };
  } catch {
    throw new Error("Invalid pagination cursor");
  }
}

export class AccountProjectionService {
  constructor(private sql: SqlExecutor) {}
  async purchases(accountId: string, input: { cursor?: string; limit: number }) {
    const cursor = decodeCursor(input.cursor);
    const rows = (
        await this.sql.query<any>(
          `select p.id,p.checkout_id,p.listing_id,p.listing_title_snapshot,p.canonical_minor_snapshot,p.canonical_currency_snapshot,p.state,p.created_at,e.state entitlement_state,e.expires_at entitlement_expires_at,(e.state='active' and (e.expires_at is null or e.expires_at>now())) access_available from purchase_capability.purchases p left join entitlement_capability.entitlements e on e.purchase_id=p.id where p.buyer_id=$1 and ($2::timestamptz is null or (p.created_at,p.id)<($2::timestamptz,$3::uuid)) order by p.created_at desc,p.id desc limit $4`,
          [accountId, cursor?.createdAt ?? null, cursor?.id ?? null, input.limit + 1],
        )
      ).rows,
      visible = rows.slice(0, input.limit);
    return {
      items: visible.map((row) => ({
        id: row.id,
        checkout_id: row.checkout_id,
        listing_id: row.listing_id,
        title: row.listing_title_snapshot,
        amount_minor: row.canonical_minor_snapshot,
        currency: row.canonical_currency_snapshot,
        state: row.state,
        created_at: row.created_at,
        entitlement_state: row.entitlement_state ?? null,
        entitlement_expires_at: row.entitlement_expires_at ?? null,
        access_available: row.access_available === true,
      })),
      nextCursor:
        rows.length > input.limit
          ? encodeCursor(visible.at(-1).created_at, visible.at(-1).id)
          : null,
    };
  }
  async purchase(accountId: string, id: string) {
    const row = (
      await this.sql.query<any>(
        `select p.id,p.checkout_id,p.listing_id,p.listing_title_snapshot,p.canonical_minor_snapshot,p.canonical_currency_snapshot,p.state,p.created_at,e.state entitlement_state,e.expires_at entitlement_expires_at,(e.state='active' and (e.expires_at is null or e.expires_at>now())) access_available from purchase_capability.purchases p left join entitlement_capability.entitlements e on e.purchase_id=p.id where p.buyer_id=$1 and p.id=$2`,
        [accountId, id],
      )
    ).rows[0];
    if (!row) throw new Error("Purchase not found");
    return {
      id: row.id,
      checkout_id: row.checkout_id,
      listing_id: row.listing_id,
      title: row.listing_title_snapshot,
      amount_minor: row.canonical_minor_snapshot,
      currency: row.canonical_currency_snapshot,
      state: row.state,
      created_at: row.created_at,
      entitlement_state: row.entitlement_state ?? null,
      entitlement_expires_at: row.entitlement_expires_at ?? null,
      access_available: row.access_available === true,
    };
  }
  async earnings(accountId: string) {
    const rows = (
      await this.sql.query<any>(
        `select currency,balance_state,sum(case direction when 'credit' then amount_minor else -amount_minor end)::bigint amount_minor from ledger_capability.entries where account_id=$1 group by currency,balance_state order by currency,balance_state`,
        [accountId],
      )
    ).rows;
    return {
      balances: rows.map((row) => ({
        currency: row.currency,
        state: row.balance_state,
        amount_minor: String(row.amount_minor),
      })),
    };
  }
  async earningEntries(accountId: string, input: { cursor?: string; limit: number }) {
    const cursor = decodeCursor(input.cursor);
    const rows = (
        await this.sql.query<any>(
          `select id,purchase_id,entry_type,direction,amount_minor,currency,recipient_role,balance_state,created_at from ledger_capability.entries where account_id=$1 and ($2::timestamptz is null or (created_at,id)<($2::timestamptz,$3::uuid)) order by created_at desc,id desc limit $4`,
          [accountId, cursor?.createdAt ?? null, cursor?.id ?? null, input.limit + 1],
        )
      ).rows,
      visible = rows.slice(0, input.limit);
    return {
      items: visible.map((row) => ({ ...row, amount_minor: String(row.amount_minor) })),
      nextCursor:
        rows.length > input.limit
          ? encodeCursor(visible.at(-1).created_at, visible.at(-1).id)
          : null,
    };
  }
}
