import { Money } from "@/modules/money/money";
import type { QueryExecutor } from "../shared/database";
import type {
  WalletCredit,
  WalletDebit,
  WalletRepository,
  WalletTransaction,
} from "@/modules/wallet/wallet";

export class PostgresWalletRepository implements WalletRepository {
  constructor(private sql: QueryExecutor) {}
  async lockAccount(id: string) {
    await this.sql.query(`select pg_advisory_xact_lock(hashtextextended($1,7331))`, [id]);
  }
  async summary(accountId: string) {
    const r = (
      await this.sql.query<any>(
        `select coalesce((select sum(amount_minor) from wallet_capability.credits where account_id=(select id from identity_capability.accounts where uuid=$1) and state='available'),0)-coalesce((select sum(amount_minor) from wallet_capability.debits where account_id=(select id from identity_capability.accounts where uuid=$1)),0) available,coalesce((select sum(amount_minor) from wallet_capability.credits where account_id=(select id from identity_capability.accounts where uuid=$1) and state='pending'),0) pending`,
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
  async history(accountId: string, limit = 10) {
    const rows = (
      await this.sql.query<any>(
        `select 'funding_credit' kind,c.uuid as id,f.uuid as source_id,c.amount_minor,c.currency,c.state,c.created_at,f.provider_initialization->>'providerDisplayName' as provider_display_name,f.provider_reference
           from wallet_capability.credits c join funding_capability.funding_transactions f on f.id=c.funding_id
          where c.account_id=(select id from identity_capability.accounts where uuid=$1)
         union all
         select 'purchase_debit',d.uuid,c.uuid,d.amount_minor,d.currency,'complete',d.created_at,null::text,null::text
           from wallet_capability.debits d join checkout_capability.checkouts c on c.id=d.checkout_id
          where d.account_id=(select id from identity_capability.accounts where uuid=$1)
          order by created_at desc limit $2`,
        [accountId, Math.max(1, Math.min(limit, 50))],
      )
    ).rows;
    return rows.map((r) => ({
      kind: r.kind,
      id: r.id,
      sourceId: r.source_id,
      amount: Money.of(BigInt(r.amount_minor), r.currency),
      state: r.state,
      createdAt: r.created_at,
      ...(r.provider_display_name ? { providerDisplayName: r.provider_display_name } : {}),
      ...(r.provider_reference ? { providerReference: r.provider_reference } : {}),
    })) as WalletTransaction[];
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
