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

type DistributionInput = { search?: string; cursor?: string; limit: number };

export type OperatorDistributionSummary = {
  id: string;
  purchaseId: string;
  listingId: string;
  listingTitle: string;
  buyer: { id: string; username: string; email: string | null };
  grossAmountMinor: string;
  currency: string;
  referralAllocatedMinor: string;
  platformRemainderMinor: string;
  beneficiaryCount: number;
  completedAt: string;
};

export type OperatorDistributionDetail = OperatorDistributionSummary & {
  purchaseState: string;
  purchaseCreatedAt: string;
  attribution: {
    id: string | null;
    referrer: { id: string; username: string; email: string | null } | null;
  };
  policySnapshot: unknown;
  allocations: Array<{
    id: string;
    account: { id: string; username: string; email: string | null };
    level: number | null;
    amountMinor: string;
    currency: string;
    direction: "credit" | "debit";
    entryType: string;
    balanceState: string;
    maturityAt: string | null;
    settledAt: string | null;
    originalEntryId: string | null;
    reversalId: string | null;
    createdAt: string;
  }>;
  reversal: {
    id: string;
    reason: string;
    source: string;
    state: string;
    processedAt: string | null;
  } | null;
};

export class OperatorDistributionService {
  constructor(private readonly sql: SqlExecutor) {}

  async list(input: DistributionInput) {
    const cursor = decodeCursor(input.cursor);
    const search = cleanSearch(input.search);
    const rows = (
      await this.sql.query<any>(
        `select d.uuid as id,p.uuid as purchase_id,d.gross_minor,d.currency,d.platform_amount_minor,d.completed_at,
              l.uuid as listing_id,p.listing_title_snapshot,b.uuid as buyer_id,b.username buyer_username,b.email buyer_email,
              coalesce(sum(case when e.recipient_role='referral' and e.direction='credit' and e.reversal_id is null then e.amount_minor else 0 end),0)::bigint referral_allocated_minor,
              count(distinct case when e.recipient_role='referral' and e.direction='credit' and e.reversal_id is null then e.account_id end)::int beneficiary_count
         from ledger_capability.purchase_distributions d
         join purchase_capability.purchases p on p.id=d.purchase_id
         join identity_capability.account_profiles b on b.id=p.buyer_id
         left join ledger_capability.entries e on e.distribution_id=d.id
         join listing_capability.listings l on l.id=p.listing_id
        where p.checkout_id is not null
          and ($1::text is null or d.uuid::text=$1 or p.uuid::text=$1 or p.listing_title_snapshot ilike '%'||$1||'%' escape '\\' or b.username ilike '%'||$1||'%' escape '\\' or b.email ilike '%'||$1||'%' escape '\\' or exists(select 1 from ledger_capability.entries se join identity_capability.account_profiles sa on sa.id=se.account_id where se.distribution_id=d.id and se.recipient_role='referral' and (sa.username ilike '%'||$1||'%' escape '\\' or sa.email ilike '%'||$1||'%' escape '\\')))
          and ($2::timestamptz is null or (d.completed_at,d.id)<($2::timestamptz,(select id from ledger_capability.purchase_distributions where uuid=$3)))
        group by d.id,p.id,b.id,b.uuid,b.username,b.email,l.id
        order by d.completed_at desc,d.id desc
        limit $4`,
        [search, cursor?.createdAt ?? null, cursor?.id ?? null, input.limit + 1],
      )
    ).rows;
    const visible = rows.slice(0, input.limit);
    return {
      items: visible.map((row) => this.summary(row)),
      nextCursor:
        rows.length > input.limit
          ? encodeCursor(visible.at(-1).completed_at, visible.at(-1).id)
          : null,
    };
  }

  async get(id: string): Promise<OperatorDistributionDetail> {
    const row = (
      await this.sql.query<any>(
        `select d.uuid as id,p.uuid as purchase_id,d.gross_minor,d.currency,d.platform_amount_minor,d.completed_at,d.policy_snapshot,
              l.uuid as listing_id,p.listing_title_snapshot,b.uuid as buyer_id,b.username buyer_username,b.email buyer_email,p.state purchase_state,p.created_at purchase_created_at,
              a.uuid referral_attribution_id,ra.uuid referral_referrer_account_id,
              ra.username referrer_username,ra.email referrer_email,
              a.uuid attribution_id
         from ledger_capability.purchase_distributions d
         join purchase_capability.purchases p on p.id=d.purchase_id
         join identity_capability.account_profiles b on b.id=p.buyer_id
         join listing_capability.listings l on l.id=p.listing_id
         left join identity_capability.account_profiles ra on ra.id=p.referral_referrer_account_id
         left join referral_capability.listing_attributions a on a.id=p.referral_attribution_id
        where d.uuid=$1 and p.checkout_id is not null`,
        [id],
      )
    ).rows[0];
    if (!row) throw new Error("Distribution not found");
    const entries = (
      await this.sql.query<any>(
        `select e.uuid as id,aa.uuid as account_id,a.username,a.email,e.referral_level,e.amount_minor,e.currency,e.direction,e.entry_type,e.balance_state,e.maturity_at,
              oe.uuid original_entry_id,rv.uuid reversal_id,e.created_at,s.settled_at,
              r.uuid reversal_record_id,r.reason reversal_reason,r.source reversal_source,r.state reversal_state,r.processed_at reversal_processed_at
         from ledger_capability.entries e
         join identity_capability.account_profiles a on a.id=e.account_id
         join identity_capability.accounts aa on aa.id=e.account_id
         left join ledger_capability.entries oe on oe.id=e.original_entry_id
         left join ledger_capability.reversals rv on rv.id=e.reversal_id
         left join ledger_capability.entry_settlements s on s.original_entry_id=e.id
         left join ledger_capability.reversals r on r.id=e.reversal_id
        where e.distribution_id=(select id from ledger_capability.purchase_distributions where uuid=$1) and e.recipient_role='referral'
        order by e.created_at asc,e.id asc limit 200`,
        [id],
      )
    ).rows;
    const reversal = (
      await this.sql.query<any>(
        `select uuid as id,reason,source,state,processed_at from ledger_capability.reversals where distribution_id=(select id from ledger_capability.purchase_distributions where uuid=$1) limit 1`,
        [id],
      )
    ).rows[0];
    const summary = this.summary(row);
    return {
      ...summary,
      purchaseState: row.purchase_state,
      purchaseCreatedAt: row.purchase_created_at,
      attribution: {
        id: row.attribution_id ?? row.referral_attribution_id ?? null,
        referrer: row.referrer_username
          ? {
              id: row.referral_referrer_account_id,
              username: row.referrer_username,
              email: row.referrer_email,
            }
          : null,
      },
      policySnapshot: row.policy_snapshot,
      allocations: entries.map((entry) => ({
        id: entry.id,
        account: { id: entry.account_id, username: entry.username, email: entry.email },
        level: entry.referral_level ?? null,
        amountMinor: String(entry.amount_minor),
        currency: entry.currency,
        direction: entry.direction,
        entryType: entry.entry_type,
        balanceState: entry.reversal_id
          ? "reversed"
          : entry.settled_at
            ? "available"
            : entry.balance_state,
        maturityAt: entry.maturity_at ?? null,
        settledAt: entry.settled_at ?? null,
        originalEntryId: entry.original_entry_id ?? null,
        reversalId: entry.reversal_id ?? null,
        createdAt: entry.created_at,
      })),
      reversal: reversal
        ? {
            id: reversal.id,
            reason: reversal.reason,
            source: reversal.source,
            state: reversal.state,
            processedAt: reversal.processed_at ?? null,
          }
        : null,
    };
  }

  private summary(row: any): OperatorDistributionSummary {
    return {
      id: row.id,
      purchaseId: row.purchase_id,
      listingId: row.listing_id,
      listingTitle: row.listing_title_snapshot,
      buyer: { id: row.buyer_id, username: row.buyer_username, email: row.buyer_email },
      grossAmountMinor: String(row.gross_minor),
      currency: row.currency,
      referralAllocatedMinor: String(row.referral_allocated_minor ?? 0),
      platformRemainderMinor: String(row.platform_amount_minor ?? 0),
      beneficiaryCount: Number(row.beneficiary_count ?? 0),
      completedAt: row.completed_at,
    };
  }
}

export type OperatorEarningsEntry = {
  id: string;
  account: { id: string; username: string; email: string | null };
  purchaseId: string | null;
  distributionId: string | null;
  entryType: string;
  direction: "credit" | "debit";
  amountMinor: string;
  currency: string;
  level: number | null;
  balanceState: string;
  settledAt: string | null;
  createdAt: string;
};

export class OperatorEarningsService {
  constructor(private readonly sql: SqlExecutor) {}

  async list(input: {
    search?: string;
    state?: "pending" | "available" | "reversed";
    cursor?: string;
    limit: number;
  }) {
    const cursor = decodeCursor(input.cursor);
    const search = cleanSearch(input.search);
    const state = input.state ?? null;
    const rows = (
      await this.sql.query<any>(
        `select e.uuid as id,a.uuid as account_id,a.username,a.email,p.uuid as purchase_id,d.uuid as distribution_id,e.entry_type,e.direction,e.amount_minor,e.currency,e.referral_level,e.balance_state,e.created_at,s.settled_at,
              case when e.reversal_id is not null or exists(select 1 from ledger_capability.entries c where c.original_entry_id=e.id) then 'reversed' when s.id is not null then 'available' else e.balance_state end effective_state
         from ledger_capability.entries e
         join identity_capability.account_profiles a on a.id=e.account_id
         left join purchase_capability.purchases p on p.id=e.purchase_id
         left join ledger_capability.purchase_distributions d on d.id=e.distribution_id
         left join ledger_capability.entry_settlements s on s.original_entry_id=e.id
        where e.recipient_role='referral'
          and ($1::text is null or a.username ilike '%'||$1||'%' escape '\\' or a.email ilike '%'||$1||'%' escape '\\' or a.uuid::text=$1 or e.uuid::text=$1 or p.uuid::text=$1)
          and ($2::text is null or (case when e.reversal_id is not null or exists(select 1 from ledger_capability.entries c where c.original_entry_id=e.id) then 'reversed' when s.id is not null then 'available' else e.balance_state end)=$2)
          and ($3::timestamptz is null or (e.created_at,e.id)<($3::timestamptz,(select id from ledger_capability.entries where uuid=$4)))
        order by e.created_at desc,e.id desc limit $5`,
        [search, state, cursor?.createdAt ?? null, cursor?.id ?? null, input.limit + 1],
      )
    ).rows;
    const visible = rows.slice(0, input.limit);
    const totals = (
      await this.sql.query<any>(
        `select coalesce(sum(case when e.balance_state='pending' and e.direction='credit' and e.reversal_id is null and not exists(select 1 from ledger_capability.entries c where c.original_entry_id=e.id) then e.amount_minor when e.balance_state='pending' and e.direction='debit' and e.reversal_id is null then -e.amount_minor else 0 end),0)::bigint pending_minor,
              coalesce(sum(case when (e.balance_state='available' or s.id is not null) and e.direction='credit' and e.reversal_id is null and not exists(select 1 from ledger_capability.entries c where c.original_entry_id=e.id) then e.amount_minor when (e.balance_state='available' or s.id is not null) and e.direction='debit' and e.reversal_id is null then -e.amount_minor else 0 end),0)::bigint available_minor,
              coalesce((select sum(r.amount_minor) from ledger_capability.withdrawal_reservations r where (select ev.kind from ledger_capability.withdrawal_reservation_events ev where ev.reservation_id=r.id order by ev.created_at desc,ev.id desc limit 1)='reserved'),0)::bigint reserved_minor
         from ledger_capability.entries e left join ledger_capability.entry_settlements s on s.original_entry_id=e.id where e.recipient_role='referral'`,
      )
    ).rows[0];
    return {
      items: visible.map((row) => this.entry(row)),
      nextCursor:
        rows.length > input.limit
          ? encodeCursor(visible.at(-1).created_at, visible.at(-1).id)
          : null,
      totals: {
        pendingMinor: String(totals.pending_minor ?? 0),
        availableMinor: String(totals.available_minor ?? 0),
        reservedMinor: String(totals.reserved_minor ?? 0),
      },
    };
  }

  private entry(row: any): OperatorEarningsEntry {
    return {
      id: row.id,
      account: { id: row.account_id, username: row.username, email: row.email },
      purchaseId: row.purchase_id ?? null,
      distributionId: row.distribution_id ?? null,
      entryType: row.entry_type,
      direction: row.direction,
      amountMinor: String(row.amount_minor),
      currency: row.currency,
      level: row.referral_level ?? null,
      balanceState: row.effective_state,
      settledAt: row.settled_at ?? null,
      createdAt: row.created_at,
    };
  }
}
