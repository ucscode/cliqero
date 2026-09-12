import { randomUUID } from "node:crypto";
import { Money } from "@/modules/money/money";
import type { SqlExecutor } from "./database";
import type {
  FundingRepository,
  FundingHistoryPage,
  FundingState,
  FundingTransaction,
} from "@/modules/funding/funding";
import type {
  WalletCredit,
  WalletDebit,
  WalletRepository,
  WalletTransaction,
} from "@/modules/wallet/wallet";
import type { Checkout, CheckoutRepository } from "@/modules/checkout/checkout";

export class PostgresFundingRepository implements FundingRepository {
  constructor(private sql: SqlExecutor) {}
  findById(id: string, o?: { forUpdate?: boolean }) {
    return this.find("f.uuid=$1", [id], o);
  }
  findByIdempotency(accountId: string, key: string) {
    return this.find(
      "f.account_id=(select id from identity_capability.accounts where uuid=$1) and f.idempotency_key=$2",
      [accountId, key],
    );
  }
  findByProviderReference(provider: string, reference: string) {
    return this.find("f.provider_name=$1 and f.provider_reference=$2", [provider, reference]);
  }
  async findActiveForAccount(accountId: string) {
    const rows = (
      await this.sql.query<any>(
        `select f.*,f.uuid as id,a.uuid as account_uuid from funding_capability.funding_transactions f join identity_capability.accounts a on a.id=f.account_id where a.uuid=$1 and f.state in ('initialization_pending','initializing','awaiting_payment','verification_pending') order by f.updated_at desc,f.id desc`,
        [accountId],
      )
    ).rows;
    return rows.map((row) => this.map(row));
  }
  async findHistoryForAccount(input: {
    accountId: string;
    cursor?: string;
    limit?: number;
    state?: FundingState;
    active?: boolean;
  }): Promise<FundingHistoryPage> {
    const limit = Math.max(1, Math.min(input.limit ?? 20, 50));
    const rows = (
      await this.sql.query<any>(
        `select f.*,f.uuid as id,a.uuid as account_uuid from funding_capability.funding_transactions f join identity_capability.accounts a on a.id=f.account_id
         where a.uuid=$1 and ($2::timestamptz is null or f.created_at < $2)
           and ($3::text is null or f.state=$3)
           and (not $4::boolean or f.state in ('initialization_pending','initializing','awaiting_payment','verification_pending'))
         order by f.created_at desc,f.id desc limit $5`,
        [
          input.accountId,
          input.cursor ?? null,
          input.state ?? null,
          input.active ?? false,
          limit + 1,
        ],
      )
    ).rows;
    const items = rows.slice(0, limit).map((row) => this.map(row));
    return {
      items,
      nextCursor: rows.length > limit ? (items.at(-1)?.createdAt?.toISOString() ?? null) : null,
    };
  }
  async recordCancellation(fundingId: string, accountId: string, previousState: FundingState) {
    await this.sql.query(
      `insert into kernel.audit_records(actor_id,action,subject_type,subject_id,previous_state,new_state,correlation_id)
       values((select id from identity_capability.accounts where uuid=$1),'funding.cancelled','funding_transaction',$2,$3::jsonb,$4::jsonb,$5)`,
      [
        accountId,
        fundingId,
        JSON.stringify({ state: previousState }),
        JSON.stringify({ state: "cancelled" }),
        randomUUID(),
      ],
    );
  }
  async findWork(state: FundingState, limit = 50) {
    const rows = (
      await this.sql.query<any>(
        `select uuid as id from funding_capability.funding_transactions where state=$1 order by updated_at,id limit $2`,
        [state, limit],
      )
    ).rows;
    return (await Promise.all(rows.map((r: any) => this.findById(r.id)))).filter(
      Boolean,
    ) as FundingTransaction[];
  }
  async findInitializationWork(staleBefore: Date, limit = 50) {
    const rows = (
      await this.sql.query<any>(
        `select f.*,f.uuid as id,a.uuid as account_uuid from funding_capability.funding_transactions f join identity_capability.accounts a on a.id=f.account_id where f.state='initialization_pending' or (f.state='initializing' and coalesce(f.initialization_claimed_at,f.updated_at)<=$1) order by f.created_at,f.id limit $2`,
        [staleBefore, limit],
      )
    ).rows;
    return rows.map((row) => this.map(row));
  }
  async claimInitialization(id: string, staleBefore: Date, claimedAt: Date) {
    const row = (
      await this.sql.query<any>(
        `update funding_capability.funding_transactions f set state='initializing',initialization_claimed_at=$3,updated_at=now() where f.uuid=$1 and (f.state='initialization_pending' or (f.state='initializing' and coalesce(f.initialization_claimed_at,f.updated_at)<=$2)) returning f.*,f.uuid as id, (select uuid from identity_capability.accounts where id=f.account_id) as account_uuid`,
        [id, staleBefore, claimedAt],
      )
    ).rows[0];
    return row ? this.map(row) : null;
  }
  async save(v: FundingTransaction) {
    await this.sql.query(
      `insert into funding_capability.funding_transactions(uuid,account_id,provider_name,provider_reference,canonical_amount_minor,canonical_currency,collection_amount_minor,collection_currency,conversion_snapshot,state,idempotency_key,provider_initialization,confirmed_at,initialization_claimed_at)
    values($1,(select id from identity_capability.accounts where uuid=$2),$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,$13,$14) on conflict(uuid) do update set state=excluded.state,provider_initialization=coalesce(excluded.provider_initialization,funding_capability.funding_transactions.provider_initialization),confirmed_at=coalesce(excluded.confirmed_at,funding_capability.funding_transactions.confirmed_at),initialization_claimed_at=excluded.initialization_claimed_at,updated_at=now()`,
      [
        v.id,
        v.accountId,
        v.providerName,
        v.providerReference,
        v.canonicalAmount.minorAmount.toString(),
        v.canonicalAmount.currency,
        v.collectionAmount.minorAmount.toString(),
        v.collectionAmount.currency,
        v.conversionSnapshot
          ? JSON.stringify({
              ...v.conversionSnapshot,
              observedAt: v.conversionSnapshot.observedAt.toISOString(),
            })
          : null,
        v.state,
        v.idempotencyKey,
        v.providerInitialization ? JSON.stringify(v.providerInitialization) : null,
        v.confirmedAt ?? null,
        v.initializationClaimedAt ?? null,
      ],
    );
  }
  private async find(where: string, values: unknown[], o?: { forUpdate?: boolean }) {
    const r = (
      await this.sql.query<any>(
        `select f.*,f.uuid as id, a.uuid as account_uuid from funding_capability.funding_transactions f join identity_capability.accounts a on a.id=f.account_id where ${where}${o?.forUpdate ? " for update" : ""}`,
        [...values],
      )
    ).rows[0];
    return r ? this.map(r) : null;
  }
  private map(r: any) {
    const s = r.conversion_snapshot;
    return {
      id: r.id,
      accountId: r.account_uuid ?? r.account_id,
      providerName: r.provider_name,
      providerReference: r.provider_reference,
      canonicalAmount: Money.of(BigInt(r.canonical_amount_minor), r.canonical_currency),
      collectionAmount: Money.of(BigInt(r.collection_amount_minor), r.collection_currency),
      conversionSnapshot: s ? { ...s, observedAt: new Date(s.observedAt) } : undefined,
      state: r.state,
      idempotencyKey: r.idempotency_key,
      providerInitialization: r.provider_initialization ?? undefined,
      confirmedAt: r.confirmed_at ?? undefined,
      initializationClaimedAt: r.initialization_claimed_at ?? undefined,
      createdAt: r.created_at ?? undefined,
    } as FundingTransaction;
  }
}

export class PostgresWalletRepository implements WalletRepository {
  constructor(private sql: SqlExecutor) {}
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
        `select 'funding_credit' kind,c.uuid as id,f.uuid as source_id,c.amount_minor,c.currency,c.state,c.created_at
           from wallet_capability.credits c join funding_capability.funding_transactions f on f.id=c.funding_id
          where c.account_id=(select id from identity_capability.accounts where uuid=$1)
         union all
         select 'purchase_debit',d.uuid,c.uuid,d.amount_minor,d.currency,'complete',d.created_at
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

export class PostgresCheckoutRepository implements CheckoutRepository {
  constructor(private sql: SqlExecutor) {}
  findById(id: string, o?: { forUpdate?: boolean }) {
    return this.find("c.uuid=$1", [id], o);
  }
  findByIdempotency(b: string, k: string) {
    return this.find(
      "c.buyer_id=(select id from identity_capability.accounts where uuid=$1) and c.idempotency_key=$2",
      [b, k],
    );
  }
  async findAwaitingFunds(limit = 50) {
    const rows = (
      await this.sql.query<any>(
        `select c.*,c.uuid as id,a.uuid as buyer_uuid,l.uuid as listing_uuid,p.uuid as purchase_uuid from checkout_capability.checkouts c join identity_capability.accounts a on a.id=c.buyer_id join listing_capability.listings l on l.id=c.listing_id join purchase_capability.purchases p on p.id=c.purchase_id where c.state='awaiting_funds' order by c.created_at,c.id limit $1`,
        [limit],
      )
    ).rows;
    return rows.map((r) => this.map(r));
  }
  async save(v: Checkout) {
    await this.sql.query(
      `insert into checkout_capability.checkouts(uuid,buyer_id,listing_id,purchase_id,amount_minor,currency,state,idempotency_key,paid_at) values($1,(select id from identity_capability.accounts where uuid=$2),(select id from listing_capability.listings where uuid=$3),(select id from purchase_capability.purchases where uuid=$4),$5,$6,$7,$8,$9) on conflict(uuid) do update set state=excluded.state,paid_at=coalesce(excluded.paid_at,checkout_capability.checkouts.paid_at),updated_at=now()`,
      [
        v.id,
        v.buyerId,
        v.listingId,
        v.purchaseId,
        v.amount.minorAmount.toString(),
        v.amount.currency,
        v.state,
        v.idempotencyKey,
        v.paidAt ?? null,
      ],
    );
  }
  private async find(w: string, v: unknown[], o?: { forUpdate?: boolean }) {
    const r = (
      await this.sql.query<any>(
        `select c.*,c.uuid as id,a.uuid as buyer_uuid,l.uuid as listing_uuid,p.uuid as purchase_uuid from checkout_capability.checkouts c join identity_capability.accounts a on a.id=c.buyer_id join listing_capability.listings l on l.id=c.listing_id join purchase_capability.purchases p on p.id=c.purchase_id where ${w}${o?.forUpdate ? " for update" : ""}`,
        v,
      )
    ).rows[0];
    return r ? this.map(r) : null;
  }
  private map(r: any): Checkout {
    return {
      id: r.id,
      buyerId: r.buyer_uuid ?? r.buyer_id,
      listingId: r.listing_uuid ?? r.listing_id,
      purchaseId: r.purchase_uuid ?? r.purchase_id,
      amount: Money.of(BigInt(r.amount_minor), r.currency),
      state: r.state,
      idempotencyKey: r.idempotency_key,
      paidAt: r.paid_at ?? undefined,
    };
  }
}
