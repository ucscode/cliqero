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

export type OperatorAccountSummary = {
  id: string;
  handle: string;
  displayName: string | null;
  email: string;
  country: string | null;
  roles: string[];
  createdAt: string;
  directReferralCount: number;
};

export type OperatorAccountDetail = OperatorAccountSummary & {
  parent: { id: string; handle: string; displayName: string | null } | null;
  purchaseCount: number;
  latestParentReassignment: {
    actorId: string | null;
    previousParentId: string | null;
    parentId: string | null;
    occurredAt: string;
  } | null;
};

export class OperatorAccountService {
  constructor(private readonly sql: SqlExecutor) {}

  async list(input: { search?: string; cursor?: string; limit: number }) {
    const cursor = decodeCursor(input.cursor);
    const rawSearch = input.search?.trim() || "";
    const search = rawSearch ? rawSearch.replace(/[\\%_]/g, "\\$&") : null;
    const rows = (
      await this.sql.query<any>(
        `select a.id,a.email,a.handle,a.display_name,a.metadata->>'country' country,a.created_at,
          coalesce((select array_agg(ac.capability order by ac.capability) from identity_capability.account_capabilities ac where ac.account_id=a.id), '{}') roles,
          (select count(*)::int from referral_capability.account_referrals r where r.parent_account_id=a.id) direct_referral_count
         from identity_capability.accounts a
         where ($1::text is null or a.handle ilike '%'||$1||'%' escape '\\' or a.email ilike '%'||$1||'%' escape '\\' or a.id::text=$1)
           and ($2::timestamptz is null or (a.created_at,a.id)<($2::timestamptz,$3::uuid))
         order by a.created_at desc,a.id desc limit $4`,
        [search, cursor?.createdAt ?? null, cursor?.id ?? null, input.limit + 1],
      )
    ).rows;
    const visible = rows.slice(0, input.limit);
    return {
      items: visible.map((row) => this.summary(row)),
      nextCursor:
        rows.length > input.limit
          ? encodeCursor(visible.at(-1).created_at, visible.at(-1).id)
          : null,
    };
  }

  async get(accountId: string): Promise<OperatorAccountDetail> {
    const row = (
      await this.sql.query<any>(
        `select a.id,a.email,a.handle,a.display_name,a.metadata->>'country' country,a.created_at,
          coalesce((select array_agg(ac.capability order by ac.capability) from identity_capability.account_capabilities ac where ac.account_id=a.id), '{}') roles,
          (select count(*)::int from referral_capability.account_referrals r where r.parent_account_id=a.id) direct_referral_count,
          p.id parent_id,p.handle parent_handle,p.display_name parent_display_name,
          (select count(*)::int from purchase_capability.purchases purchase where purchase.buyer_id=a.id) purchase_count
         from identity_capability.accounts a
         left join referral_capability.account_referrals ar on ar.child_account_id=a.id
         left join identity_capability.accounts p on p.id=ar.parent_account_id
         where a.id=$1`,
        [accountId],
      )
    ).rows[0];
    if (!row) throw new Error("Account not found");
    const audit = (
      await this.sql.query<any>(
        `select actor_id,previous_state->>'parent_account_id' previous_parent_id,
                new_state->>'parent_account_id' parent_id,occurred_at
           from kernel.audit_records
          where action='referral.parent_reassigned' and subject_type='account_referral' and subject_id=$1
          order by occurred_at desc,id desc limit 1`,
        [accountId],
      )
    ).rows[0];
    return {
      ...this.summary(row),
      parent: row.parent_id
        ? {
            id: row.parent_id,
            handle: row.parent_handle,
            displayName: row.parent_display_name ?? null,
          }
        : null,
      purchaseCount: Number(row.purchase_count ?? 0),
      latestParentReassignment: audit
        ? {
            actorId: audit.actor_id ?? null,
            previousParentId: audit.previous_parent_id ?? null,
            parentId: audit.parent_id ?? null,
            occurredAt: audit.occurred_at,
          }
        : null,
    };
  }

  private summary(row: any): OperatorAccountSummary {
    return {
      id: row.id,
      handle: row.handle,
      displayName: row.display_name ?? null,
      email: row.email,
      country: row.country ?? null,
      roles: Array.isArray(row.roles) ? row.roles : [],
      createdAt: row.created_at,
      directReferralCount: Number(row.direct_referral_count ?? 0),
    };
  }
}
