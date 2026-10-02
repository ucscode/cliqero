import { Money } from "@/modules/money/money";
import type { QueryExecutor } from "../shared/database";
import type {
  WalletCredit,
  WalletDebit,
  WalletRepository,
  WalletTransaction,
  WalletTransactionPage,
} from "@/modules/wallet/wallet";

export class PostgresWalletRepository implements WalletRepository {
  constructor(private sql: QueryExecutor) {}
  async lockAccount(id: string) {
    await this.sql.query(`select pg_advisory_xact_lock(hashtextextended($1,0))`, [
      `wallet-transfer:${id}`,
    ]);
  }
  async summary(accountId: string) {
    const r = (
      await this.sql.query<any>(
        `select coalesce((select sum(amount_minor) from wallet_capability.credits where account_id=(select id from identity_capability.accounts where uuid=$1) and state='available'),0)
           + coalesce((select sum(amount_minor) from wallet_capability.transfer_entries where wallet='funding' and direction='credit' and correlation_id in (select correlation_id from wallet_capability.transfers where account_id=(select id from identity_capability.accounts where uuid=$1))),0)
           + coalesce((select sum(amount_minor) from wallet_capability.funding_adjustments where account_id=(select id from identity_capability.accounts where uuid=$1)),0)
           - coalesce((select sum(amount_minor) from wallet_capability.debits where account_id=(select id from identity_capability.accounts where uuid=$1)),0)
           - coalesce((select sum(amount_minor) from wallet_capability.transfer_entries where wallet='funding' and direction='debit' and correlation_id in (select correlation_id from wallet_capability.transfers where account_id=(select id from identity_capability.accounts where uuid=$1))),0) available,
           coalesce((select sum(amount_minor) from wallet_capability.credits where account_id=(select id from identity_capability.accounts where uuid=$1) and state='pending'),0) pending`,
        [accountId],
      )
    ).rows[0];
    return {
      currency: "USD" as const,
      available: Money.of(BigInt(r.available), "USD"),
      pending: Money.of(BigInt(r.pending), "USD"),
    };
  }
  async findCreditByFunding(id: string) {
    const r = (
      await this.sql.query<any>(
        `select c.*,c.uuid as id,a.uuid as account_uuid,f.uuid as funding_uuid from wallet_capability.credits c join identity_capability.accounts a on a.id=c.account_id join funding_capability.funding_transactions f on f.id=c.funding_id where f.uuid=$1`,
        [id],
      )
    ).rows[0];
    return r ? this.credit(r) : null;
  }
  async findFundingCreditWork(limit = 50) {
    return (
      await this.sql.query<{ id: string }>(
        `select f.uuid as id
           from funding_capability.funding_transactions f
          where f.state='confirmed'
            and not exists (
              select 1 from wallet_capability.credits c where c.funding_id=f.id
            )
          order by f.updated_at,f.id
          limit $1`,
        [Math.max(1, Math.min(limit, 50))],
      )
    ).rows;
  }
  async findPendingCredits(limit = 50) {
    return (
      await this.sql.query<any>(
        `select c.*,c.uuid as id,a.uuid as account_uuid,f.uuid as funding_uuid from wallet_capability.credits c join identity_capability.accounts a on a.id=c.account_id join funding_capability.funding_transactions f on f.id=c.funding_id where c.state='pending' order by c.created_at,c.id limit $1`,
        [limit],
      )
    ).rows.map((r) => this.credit(r));
  }
  async createCredit(v: WalletCredit) {
    await this.sql.query(
      `insert into wallet_capability.credits(uuid,account_id,funding_id,amount_minor,currency,state) values($1,(select id from identity_capability.accounts where uuid=$2),(select id from funding_capability.funding_transactions where uuid=$3),$4,$5,$6) on conflict(funding_id) do nothing`,
      [v.id, v.accountId, v.fundingId, v.amount.minorAmount.toString(), v.amount.currency, v.state],
    );
  }
  async makeCreditAvailable(id: string) {
    await this.sql.query(
      `update wallet_capability.credits set state='available',available_at=coalesce(available_at,now()) where uuid=$1 and state='pending'`,
      [id],
    );
  }
  async findDebitByCheckout(id: string) {
    const r = (
      await this.sql.query<any>(
        `select d.*,d.uuid as id,a.uuid as account_uuid,c.uuid as checkout_uuid from wallet_capability.debits d join identity_capability.accounts a on a.id=d.account_id join checkout_capability.checkouts c on c.id=d.checkout_id where c.uuid=$1`,
        [id],
      )
    ).rows[0];
    return r ? this.debit(r) : null;
  }
  async createDebit(v: WalletDebit) {
    await this.sql.query(
      `insert into wallet_capability.debits(uuid,account_id,checkout_id,amount_minor,currency) values($1,(select id from identity_capability.accounts where uuid=$2),(select id from checkout_capability.checkouts where uuid=$3),$4,$5) on conflict(checkout_id) do nothing`,
      [v.id, v.accountId, v.checkoutId, v.amount.minorAmount.toString(), v.amount.currency],
    );
  }
  async history(
    accountId: string,
    page: { cursor?: string; limit?: number } = {},
  ): Promise<WalletTransactionPage> {
    const limit = Math.max(1, Math.min(page.limit ?? 10, 50));
    let cursor: { createdAt: string; historyId: string } | null = null;
    if (page.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(page.cursor, "base64url").toString("utf8"));
        if (typeof decoded.created_at !== "string" || typeof decoded.history_id !== "string")
          throw new Error();
        cursor = {
          createdAt: new Date(decoded.created_at).toISOString(),
          historyId: decoded.history_id,
        };
      } catch {
        throw new Error("Invalid wallet history cursor");
      }
    }
    const rows = (
      await this.sql.query<any>(
        `select * from (
         select 'funding_credit' kind,'credit' direction,'credit:'||c.uuid::text history_id,c.uuid::text id,f.uuid::text source_id,c.amount_minor,c.currency,c.state,c.created_at,
                coalesce(f.provider_initialization->>'providerDisplayName','Provider funding') label,f.provider_reference reference,
                f.provider_initialization->>'providerDisplayName' provider_display_name,f.provider_reference
           from wallet_capability.credits c join funding_capability.funding_transactions f on f.id=c.funding_id
          where c.account_id=(select id from identity_capability.accounts where uuid=$1)
         union all
         select 'purchase_debit','debit','purchase:'||d.uuid::text,d.uuid::text,c.uuid::text,d.amount_minor,d.currency,'complete',d.created_at,'Listing purchase',null::text,null::text,null::text
           from wallet_capability.debits d join checkout_capability.checkouts c on c.id=d.checkout_id
          where d.account_id=(select id from identity_capability.accounts where uuid=$1)
         union all
         select 'funding_adjustment',case when a.amount_minor >= 0 then 'credit' else 'debit' end,
                'adjustment:'||a.uuid::text,a.uuid::text,a.funding_id::text,abs(a.amount_minor),'USD','available',a.created_at,a.reason,a.reference,null::text,null::text
           from wallet_capability.funding_adjustments a where a.account_id=(select id from identity_capability.accounts where uuid=$1)
         union all
         select 'funding_transfer',case when e.direction='credit' then 'credit' else 'debit' end,
                'transfer:'||e.uuid::text,e.uuid::text,t.correlation_id::text,e.amount_minor,'USD','complete',e.created_at,
                case when e.direction='debit' then 'Funding to earnings' else 'Earnings to funding' end,t.correlation_id::text,null::text,t.correlation_id::text
           from wallet_capability.transfer_entries e join wallet_capability.transfers t on t.id=e.transfer_id
          where e.wallet='funding' and t.account_id=(select id from identity_capability.accounts where uuid=$1)
         ) history
         where ($2::timestamptz is null or (created_at,history_id)<($2::timestamptz,$3::text))
         order by created_at desc,history_id desc limit $4`,
        [accountId, cursor?.createdAt ?? null, cursor?.historyId ?? null, limit + 1],
      )
    ).rows;
    const visible = rows.slice(0, limit);
    return {
      items: visible.map((r) => ({
        kind: r.kind,
        id: r.id,
        sourceId: r.source_id,
        historyId: r.history_id,
        amount: Money.of(BigInt(r.amount_minor), r.currency),
        direction: r.direction,
        state: r.state,
        createdAt: r.created_at,
        label: r.label,
        reference: r.reference,
        ...(r.provider_display_name ? { providerDisplayName: r.provider_display_name } : {}),
        ...(r.provider_reference ? { providerReference: r.provider_reference } : {}),
      })) as WalletTransaction[],
      nextCursor:
        rows.length > limit
          ? Buffer.from(
              JSON.stringify({
                created_at: new Date(visible.at(-1).created_at).toISOString(),
                history_id: visible.at(-1).history_id,
              }),
            ).toString("base64url")
          : null,
    };
  }
  private credit(r: any) {
    return {
      id: r.id,
      accountId: r.account_uuid ?? r.account_id,
      fundingId: r.funding_uuid ?? r.funding_id,
      amount: Money.of(BigInt(r.amount_minor), r.currency),
      state: r.state,
      createdAt: r.created_at,
      availableAt: r.available_at ?? undefined,
    } as WalletCredit;
  }
  private debit(r: any) {
    return {
      id: r.id,
      accountId: r.account_uuid ?? r.account_id,
      checkoutId: r.checkout_uuid ?? r.checkout_id,
      amount: Money.of(BigInt(r.amount_minor), r.currency),
      createdAt: r.created_at,
    } as WalletDebit;
  }
}
