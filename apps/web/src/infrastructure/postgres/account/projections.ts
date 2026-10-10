import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";

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
  constructor(private sql: QueryExecutor) {}
  async purchases(accountId: string, input: { cursor?: string; limit: number }) {
    const cursor = decodeCursor(input.cursor);
    const rows = (
        await this.sql.query<any>(
          `select p.uuid as id,c.uuid as checkout_id,l.uuid as listing_id,p.listing_title_snapshot,p.listing_short_description_snapshot,p.listing_long_description_snapshot,p.canonical_minor_snapshot,p.canonical_currency_snapshot,p.state,p.created_at,e.state entitlement_state,e.expires_at entitlement_expires_at,(e.state='active' and (e.expires_at is null or e.expires_at>now())) access_available
             from purchase_capability.purchases p left join checkout_capability.checkouts c on c.id=p.checkout_id join listing_capability.listings l on l.id=p.listing_id left join entitlement_capability.entitlements e on e.purchase_id=p.id
            where p.buyer_id=(select id from identity_capability.accounts where uuid=$1) and ($2::timestamptz is null or (p.created_at,p.id)<($2::timestamptz,(select id from purchase_capability.purchases where uuid=$3))) order by p.created_at desc,p.id desc limit $4`,
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
        short_description: row.listing_short_description_snapshot,
        long_description: row.listing_long_description_snapshot,
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
        `select p.uuid as id,c.uuid as checkout_id,l.uuid as listing_id,p.listing_title_snapshot,p.listing_short_description_snapshot,p.listing_long_description_snapshot,p.canonical_minor_snapshot,p.canonical_currency_snapshot,p.state,p.created_at,e.state entitlement_state,e.expires_at entitlement_expires_at,(e.state='active' and (e.expires_at is null or e.expires_at>now())) access_available
           from purchase_capability.purchases p left join checkout_capability.checkouts c on c.id=p.checkout_id join listing_capability.listings l on l.id=p.listing_id left join entitlement_capability.entitlements e on e.purchase_id=p.id
          where p.buyer_id=(select id from identity_capability.accounts where uuid=$1) and p.uuid=$2`,
        [accountId, id],
      )
    ).rows[0];
    if (!row) throw new Error("Purchase not found");
    return {
      id: row.id,
      checkout_id: row.checkout_id,
      listing_id: row.listing_id,
      title: row.listing_title_snapshot,
      short_description: row.listing_short_description_snapshot,
      long_description: row.listing_long_description_snapshot,
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
        `select currency,balance_state,sum(amount_minor)::bigint amount_minor from (
           select currency,balance_state,case direction when 'credit' then amount_minor else -amount_minor end amount_minor
             from ledger_capability.entries where account_id=(select id from identity_capability.accounts where uuid=$1)
           union all
           select 'USD'::text,'available'::text,amount_minor from ledger_capability.earnings_adjustments
             where account_id=(select id from identity_capability.accounts where uuid=$1)
           union all
           select 'USD'::text,'available'::text,-earnings_wallet_minor from funding_capability.funding_reversals
             where account_id=(select id from identity_capability.accounts where uuid=$1)
           union all
           select 'USD'::text,'available'::text,
                  case when from_wallet='earnings' then gross_minor else -net_minor end
             from wallet_capability.transfer_compensations
            where account_id=(select id from identity_capability.accounts where uuid=$1)
         ) effective group by currency,balance_state order by currency,balance_state`,
        [accountId],
      )
    ).rows;
    const reconciliation = (
      await this.sql.query<{
        available_minor: string;
        purchase_earnings_minor: string;
        purchase_reversals_minor: string;
        earnings_corrections_minor: string;
        manual_adjustments_minor: string;
        balance_transfers_minor: string;
        funding_reversals_minor: string;
        transfer_compensations_minor: string;
        debt_settlements_minor: string;
        withdrawal_reserved_minor: string;
        completed_withdrawals_minor: string;
        settled_purchase_earnings_minor: string;
      }>(
        `with account as (
          select id from identity_capability.accounts where uuid=$1
        ), effective_purchase as (
          select entry.* from ledger_capability.entries entry,account
           where entry.account_id=account.id and entry.currency='USD'
             and entry.entry_type in ('purchase-earnings','purchase-reversal')
             and (entry.balance_state='available' or exists (
               select 1 from ledger_capability.entry_settlements settlement
                where settlement.original_entry_id=entry.id and settlement.to_state='available'
             ) or (entry.direction='debit' and entry.basis='earnings-correction' and exists (
               select 1 from ledger_capability.entry_settlements source_settlement
                where source_settlement.original_entry_id=entry.original_entry_id
                  and source_settlement.to_state='available'
             )))
        ), latest_reservations as (
          select distinct on (event.reservation_id) event.reservation_id,event.kind,event.amount_minor
            from ledger_capability.withdrawal_reservation_events event,account
           where event.account_id=account.id and event.currency='USD'
           order by event.reservation_id,event.created_at desc,event.id desc
        )
        select
          ledger_capability.available_earnings_minor((select id from account),'USD')::text available_minor,
          coalesce((select sum(amount_minor) from effective_purchase
                     where entry_type='purchase-earnings' and direction='credit'),0)::text purchase_earnings_minor,
          coalesce(-(select sum(amount_minor) from effective_purchase
                      where entry_type='purchase-reversal' and direction='debit'
                        and basis is distinct from 'earnings-correction'),0)::text purchase_reversals_minor,
          coalesce(-(select sum(amount_minor) from effective_purchase
                      where entry_type='purchase-reversal' and direction='debit'
                        and basis='earnings-correction'),0)::text earnings_corrections_minor,
          coalesce((select sum(adjustment.amount_minor)
                      from ledger_capability.earnings_adjustments adjustment,account
                     where adjustment.account_id=account.id and not exists (
                       select 1 from wallet_capability.transfers transfer
                        where transfer.uuid::text=adjustment.reference
                     )),0)::text manual_adjustments_minor,
          coalesce((select sum(adjustment.amount_minor)
                      from ledger_capability.earnings_adjustments adjustment,account
                     where adjustment.account_id=account.id and exists (
                       select 1 from wallet_capability.transfers transfer
                        where transfer.uuid::text=adjustment.reference
                     )),0)::text balance_transfers_minor,
          coalesce(-(select sum(reversal.earnings_wallet_minor)
                       from funding_capability.funding_reversals reversal,account
                      where reversal.account_id=account.id),0)::text funding_reversals_minor,
          coalesce((select sum(case when compensation.from_wallet='earnings'
                                    then compensation.gross_minor else -compensation.net_minor end)
                      from wallet_capability.transfer_compensations compensation,account
                     where compensation.account_id=account.id),0)::text transfer_compensations_minor,
          coalesce(-(select sum(debt.amount_minor) from ledger_capability.account_debt_entries debt,account
                     where debt.account_id=account.id and debt.wallet='earnings' and debt.kind='settlement'),0)::text debt_settlements_minor,
          coalesce(-(select sum(amount_minor) from latest_reservations where kind='reserved'),0)::text withdrawal_reserved_minor,
          coalesce(-(select sum(amount_minor) from latest_reservations where kind='completed'),0)::text completed_withdrawals_minor,
          coalesce((select sum(entry.amount_minor) from ledger_capability.entries entry,account
                     where entry.account_id=account.id and entry.currency='USD'
                       and entry.entry_type='purchase-earnings' and entry.direction='credit'
                       and entry.balance_state='pending' and exists (
                         select 1 from ledger_capability.entry_settlements settlement
                          where settlement.original_entry_id=entry.id and settlement.to_state='available'
                       )),0)::text settled_purchase_earnings_minor`,
        [accountId],
      )
    ).rows[0];
    return {
      balances: rows.map((row) => ({
        currency: row.currency,
        state: row.balance_state,
        amount_minor: String(row.amount_minor),
      })),
      reconciliation: {
        available_minor: String(reconciliation?.available_minor ?? "0"),
        purchase_earnings_minor: String(reconciliation?.purchase_earnings_minor ?? "0"),
        purchase_reversals_minor: String(reconciliation?.purchase_reversals_minor ?? "0"),
        earnings_corrections_minor: String(reconciliation?.earnings_corrections_minor ?? "0"),
        manual_adjustments_minor: String(reconciliation?.manual_adjustments_minor ?? "0"),
        balance_transfers_minor: String(reconciliation?.balance_transfers_minor ?? "0"),
        funding_reversals_minor: String(reconciliation?.funding_reversals_minor ?? "0"),
        transfer_compensations_minor: String(reconciliation?.transfer_compensations_minor ?? "0"),
        debt_settlements_minor: String(reconciliation?.debt_settlements_minor ?? "0"),
        withdrawal_reserved_minor: String(reconciliation?.withdrawal_reserved_minor ?? "0"),
        completed_withdrawals_minor: String(reconciliation?.completed_withdrawals_minor ?? "0"),
        settled_purchase_earnings_minor: String(
          reconciliation?.settled_purchase_earnings_minor ?? "0",
        ),
      },
    };
  }
  async earningEntries(accountId: string, input: { cursor?: string; limit: number }) {
    const cursor = decodeCursor(input.cursor);
    const rows = (
        await this.sql.query<any>(
          `select * from (
             select 'generated:'||e.uuid::text history_id,e.uuid::text id,p.uuid::text purchase_id,
                    e.entry_type,e.direction,e.amount_minor,e.currency,e.recipient_role,e.balance_state,
                    null::text reason,null::text reference,e.created_at
               from ledger_capability.entries e left join purchase_capability.purchases p on p.id=e.purchase_id
              where e.account_id=(select id from identity_capability.accounts where uuid=$1)
             union all
             select 'adjustment:'||a.uuid::text history_id,a.uuid::text id,null::text purchase_id,
                    'earnings-adjustment'::text entry_type,
                    case when a.amount_minor < 0 then 'debit' else 'credit' end direction,
                    abs(a.amount_minor) amount_minor,'USD'::text currency,null::text recipient_role,
                    'available'::text balance_state,a.reason,a.reference,a.created_at
               from ledger_capability.earnings_adjustments a
              where a.account_id=(select id from identity_capability.accounts where uuid=$1)
             union all
             select 'funding-reversal:'||r.uuid::text history_id,r.uuid::text id,null::text purchase_id,
                    'funding-reversal'::text entry_type,'debit'::text direction,r.earnings_wallet_minor amount_minor,
                    'USD'::text currency,null::text recipient_role,'available'::text balance_state,
                    r.reason,null::text reference,r.created_at
               from funding_capability.funding_reversals r
              where r.account_id=(select id from identity_capability.accounts where uuid=$1) and r.earnings_wallet_minor>0
             union all
             select 'transfer-compensation:'||c.uuid::text history_id,c.uuid::text id,null::text purchase_id,
                    'wallet-transfer-compensation'::text entry_type,
                    case when c.from_wallet='earnings' then 'credit' else 'debit' end direction,
                    case when c.from_wallet='earnings' then c.gross_minor else c.net_minor end amount_minor,
                    'USD'::text currency,null::text recipient_role,'available'::text balance_state,
                    c.reason,transfer.uuid::text reference,c.created_at
               from wallet_capability.transfer_compensations c
               join wallet_capability.transfers transfer on transfer.id=c.transfer_id
              where c.account_id=(select id from identity_capability.accounts where uuid=$1)
           ) history
          where ($2::timestamptz is null or (created_at,history_id)<($2::timestamptz,$3::text))
          order by created_at desc,history_id desc limit $4`,
          [accountId, cursor?.createdAt ?? null, cursor?.id ?? null, input.limit + 1],
        )
      ).rows,
      visible = rows.slice(0, input.limit);
    return {
      items: visible.map((row) => ({
        id: row.id,
        purchase_id: row.purchase_id,
        entry_type: row.entry_type,
        direction: row.direction,
        amount_minor: String(row.amount_minor),
        currency: row.currency,
        recipient_role: row.recipient_role,
        balance_state: row.balance_state,
        source:
          row.entry_type === "earnings-adjustment"
            ? "adjustment"
            : row.entry_type === "funding-reversal"
              ? "funding_reversal"
              : row.entry_type === "wallet-transfer-compensation"
                ? "wallet_transfer_compensation"
                : "generated",
        reason: row.reason ?? null,
        reference: row.reference ?? null,
        created_at: row.created_at,
      })),
      nextCursor:
        rows.length > input.limit
          ? encodeCursor(visible.at(-1).created_at, visible.at(-1).history_id)
          : null,
    };
  }
}
