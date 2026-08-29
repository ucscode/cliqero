import {Money} from "@/modules/money/money";
import type {SqlExecutor} from "./database";
import type {FundingRepository,FundingState,FundingTransaction} from "@/modules/funding/funding";
import type {WalletCredit,WalletDebit,WalletRepository,WalletTransaction} from "@/modules/wallet/wallet";
import type {Checkout,CheckoutRepository} from "@/modules/checkout/checkout";

export class PostgresFundingRepository implements FundingRepository {
  constructor(private sql:SqlExecutor){}
  findById(id:string,o?:{forUpdate?:boolean}){return this.find("id=$1",[id],o);}
  findByIdempotency(accountId:string,key:string){return this.find("account_id=$1 and idempotency_key=$2",[accountId,key]);}
  findByProviderReference(provider:string,reference:string){return this.find("provider_name=$1 and provider_reference=$2",[provider,reference]);}
  async findWork(state:FundingState,limit=50){const rows=(await this.sql.query<any>(`select id from funding_capability.funding_transactions where state=$1 order by updated_at,id limit $2`,[state,limit])).rows;return (await Promise.all(rows.map((r:any)=>this.findById(r.id)))).filter(Boolean) as FundingTransaction[];}
  async save(v:FundingTransaction){await this.sql.query(`insert into funding_capability.funding_transactions(id,account_id,provider_name,provider_reference,canonical_amount_minor,canonical_currency,collection_amount_minor,collection_currency,conversion_snapshot,state,idempotency_key,provider_initialization,confirmed_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,$13) on conflict(id) do update set state=excluded.state,provider_initialization=coalesce(excluded.provider_initialization,funding_capability.funding_transactions.provider_initialization),confirmed_at=coalesce(excluded.confirmed_at,funding_capability.funding_transactions.confirmed_at),updated_at=now()`,
    [v.id,v.accountId,v.providerName,v.providerReference,v.canonicalAmount.minorAmount.toString(),v.canonicalAmount.currency,v.collectionAmount.minorAmount.toString(),v.collectionAmount.currency,v.conversionSnapshot?JSON.stringify({...v.conversionSnapshot,observedAt:v.conversionSnapshot.observedAt.toISOString()}):null,v.state,v.idempotencyKey,v.providerInitialization?JSON.stringify(v.providerInitialization):null,v.confirmedAt??null]);}
  private async find(where:string,values:unknown[],o?:{forUpdate?:boolean}){const r=(await this.sql.query<any>(`select * from funding_capability.funding_transactions where ${where}${o?.forUpdate?" for update":""}`,[...values])).rows[0];if(!r)return null;const s=r.conversion_snapshot;return {id:r.id,accountId:r.account_id,providerName:r.provider_name,providerReference:r.provider_reference,canonicalAmount:Money.of(BigInt(r.canonical_amount_minor),r.canonical_currency),collectionAmount:Money.of(BigInt(r.collection_amount_minor),r.collection_currency),conversionSnapshot:s?{...s,observedAt:new Date(s.observedAt)}:undefined,state:r.state,idempotencyKey:r.idempotency_key,providerInitialization:r.provider_initialization??undefined,confirmedAt:r.confirmed_at??undefined} as FundingTransaction;}
}

export class PostgresWalletRepository implements WalletRepository {
  constructor(private sql:SqlExecutor){}
  async lockAccount(id:string){await this.sql.query(`select pg_advisory_xact_lock(hashtextextended($1,7331))`,[id]);}
  async summary(accountId:string){const r=(await this.sql.query<any>(`select coalesce((select sum(amount_minor) from wallet_capability.credits where account_id=$1 and state='available'),0)-coalesce((select sum(amount_minor) from wallet_capability.debits where account_id=$1),0) available,coalesce((select sum(amount_minor) from wallet_capability.credits where account_id=$1 and state='pending'),0) pending`,[accountId])).rows[0];return {currency:"USD" as const,available:Money.of(BigInt(r.available),"USD"),pending:Money.of(BigInt(r.pending),"USD")};}
  async findCreditByFunding(id:string){const r=(await this.sql.query<any>(`select * from wallet_capability.credits where funding_id=$1`,[id])).rows[0];return r?this.credit(r):null;}
  async findPendingCredits(limit=50){return (await this.sql.query<any>(`select * from wallet_capability.credits where state='pending' order by created_at,id limit $1`,[limit])).rows.map(r=>this.credit(r));}
  async createCredit(v:WalletCredit){await this.sql.query(`insert into wallet_capability.credits(id,account_id,funding_id,amount_minor,currency,state) values($1,$2,$3,$4,$5,$6) on conflict(funding_id) do nothing`,[v.id,v.accountId,v.fundingId,v.amount.minorAmount.toString(),v.amount.currency,v.state]);}
  async makeCreditAvailable(id:string){await this.sql.query(`update wallet_capability.credits set state='available',available_at=coalesce(available_at,now()) where id=$1 and state='pending'`,[id]);}
  async findDebitByCheckout(id:string){const r=(await this.sql.query<any>(`select * from wallet_capability.debits where checkout_id=$1`,[id])).rows[0];return r?this.debit(r):null;}
  async createDebit(v:WalletDebit){await this.sql.query(`insert into wallet_capability.debits(id,account_id,checkout_id,amount_minor,currency) values($1,$2,$3,$4,$5) on conflict(checkout_id) do nothing`,[v.id,v.accountId,v.checkoutId,v.amount.minorAmount.toString(),v.amount.currency]);}
  async history(accountId:string){const rows=(await this.sql.query<any>(`select 'funding_credit' kind,id,funding_id source_id,amount_minor,currency,state,created_at from wallet_capability.credits where account_id=$1 union all select 'purchase_debit',id,checkout_id,amount_minor,currency,'complete',created_at from wallet_capability.debits where account_id=$1 order by created_at desc`,[accountId])).rows;return rows.map(r=>({kind:r.kind,id:r.id,sourceId:r.source_id,amount:Money.of(BigInt(r.amount_minor),r.currency),state:r.state,createdAt:r.created_at})) as WalletTransaction[];}
  private credit(r:any){return {id:r.id,accountId:r.account_id,fundingId:r.funding_id,amount:Money.of(BigInt(r.amount_minor),r.currency),state:r.state,createdAt:r.created_at,availableAt:r.available_at??undefined} as WalletCredit;}
  private debit(r:any){return {id:r.id,accountId:r.account_id,checkoutId:r.checkout_id,amount:Money.of(BigInt(r.amount_minor),r.currency),createdAt:r.created_at} as WalletDebit;}
}

export class PostgresCheckoutRepository implements CheckoutRepository {
  constructor(private sql:SqlExecutor){} findById(id:string,o?:{forUpdate?:boolean}){return this.find("id=$1",[id],o);} findByIdempotency(b:string,k:string){return this.find("buyer_id=$1 and idempotency_key=$2",[b,k]);}
  async findAwaitingFunds(limit=50){const rows=(await this.sql.query<any>(`select * from checkout_capability.checkouts where state='awaiting_funds' order by created_at,id limit $1`,[limit])).rows;return rows.map(r=>this.map(r));}
  async save(v:Checkout){await this.sql.query(`insert into checkout_capability.checkouts(id,buyer_id,listing_id,purchase_id,amount_minor,currency,state,idempotency_key,paid_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(id) do update set state=excluded.state,paid_at=coalesce(excluded.paid_at,checkout_capability.checkouts.paid_at),updated_at=now()`,[v.id,v.buyerId,v.listingId,v.purchaseId,v.amount.minorAmount.toString(),v.amount.currency,v.state,v.idempotencyKey,v.paidAt??null]);}
  private async find(w:string,v:unknown[],o?:{forUpdate?:boolean}){const r=(await this.sql.query<any>(`select * from checkout_capability.checkouts where ${w}${o?.forUpdate?" for update":""}`,v)).rows[0];return r?this.map(r):null;} private map(r:any):Checkout{return {id:r.id,buyerId:r.buyer_id,listingId:r.listing_id,purchaseId:r.purchase_id,amount:Money.of(BigInt(r.amount_minor),r.currency),state:r.state,idempotencyKey:r.idempotency_key,paidAt:r.paid_at??undefined};}
}
