import { Money } from "@/modules/money/money";
import type { PaymentRecord, PaymentRepository, PaymentState } from "@/modules/payment/payment";
import type { SqlExecutor } from "./database";

interface PaymentRow { id:string;provider_name:string;provider_reference:string;buyer_id:string;listing_id:string;
 provider_amount_minor:string;provider_currency:string;canonical_amount_minor:string;canonical_currency:string;
 state:PaymentState;idempotency_key:string;provider_transaction_id:string|null;provider_verified_payload:unknown;provider_initialization:unknown;
 provider_fee_minor:string|null;provider_fee_currency:string|null;conversion_snapshot:unknown;created_at:Date; }
export class PostgresPaymentRepository implements PaymentRepository {
  constructor(private readonly sql:SqlExecutor) {}
  async findById(id:string,options?:{forUpdate?:boolean}):Promise<PaymentRecord|null> {
    return this.find("id=$1",[id],options?.forUpdate??false);
  }
  async findByProviderReference(providerName:string,reference:string):Promise<PaymentRecord|null> {
    return this.find("provider_name=$1 and provider_reference=$2",[providerName,reference],false);
  }
  async findByIdempotencyKey(key:string):Promise<PaymentRecord|null> { return this.find("idempotency_key=$1",[key],false); }
  async save(payment:PaymentRecord):Promise<void> {
    await this.sql.query(
      `insert into payment_capability.payments
       (id,provider_name,provider_reference,buyer_id,listing_id,provider_amount_minor,provider_currency,
        canonical_amount_minor,canonical_currency,state,idempotency_key,verified_at,provider_transaction_id,provider_verified_payload,provider_initialization,provider_fee_minor,provider_fee_currency,conversion_snapshot)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,case when $10='verified' then now() else null end,$12,$13::jsonb,$14::jsonb,$15,$16,$17)
       on conflict (id) do update set state=excluded.state,
         verified_at=case when excluded.state='verified' then coalesce(payment_capability.payments.verified_at,now()) else payment_capability.payments.verified_at end,
         provider_transaction_id=coalesce(excluded.provider_transaction_id,payment_capability.payments.provider_transaction_id),
         provider_verified_payload=coalesce(excluded.provider_verified_payload,payment_capability.payments.provider_verified_payload),
         provider_initialization=coalesce(excluded.provider_initialization,payment_capability.payments.provider_initialization),
         provider_fee_minor=coalesce(excluded.provider_fee_minor,payment_capability.payments.provider_fee_minor),
         provider_fee_currency=coalesce(excluded.provider_fee_currency,payment_capability.payments.provider_fee_currency),
         updated_at=now()`,
      [payment.id,payment.providerName,payment.providerReference,payment.buyerId,payment.listingId,
       (payment.collectionAmount??payment.amount).minorAmount.toString(),(payment.collectionAmount??payment.amount).currency,payment.canonicalAmount.minorAmount.toString(),
       payment.canonicalAmount.currency,payment.state,payment.idempotencyKey,payment.providerTransactionId??null,
       payment.providerVerifiedPayload===undefined?null:JSON.stringify(payment.providerVerifiedPayload),
       payment.providerInitialization===undefined?null:JSON.stringify(payment.providerInitialization),payment.providerFee?.minorAmount.toString()??null,payment.providerFee?.currency??null,
       payment.conversionSnapshot===undefined?null:JSON.stringify({...payment.conversionSnapshot,observedAt:payment.conversionSnapshot.observedAt.toISOString()})]);
  }
  private async find(where:string,values:readonly unknown[],forUpdate:boolean):Promise<PaymentRecord|null> {
    const row=(await this.sql.query<PaymentRow>(
      `select id,provider_name,provider_reference,buyer_id,listing_id,provider_amount_minor,provider_currency,
              canonical_amount_minor,canonical_currency,state,idempotency_key,provider_transaction_id,provider_verified_payload,provider_initialization,provider_fee_minor,provider_fee_currency,conversion_snapshot,created_at
       from payment_capability.payments where ${where}${forUpdate?" for update":""}`,values)).rows[0];
    return row?{id:row.id,providerName:row.provider_name,providerReference:row.provider_reference,buyerId:row.buyer_id,
      listingId:row.listing_id,amount:Money.of(BigInt(row.provider_amount_minor),row.provider_currency),collectionAmount:Money.of(BigInt(row.provider_amount_minor),row.provider_currency),
      canonicalAmount:Money.of(BigInt(row.canonical_amount_minor),row.canonical_currency),state:row.state,idempotencyKey:row.idempotency_key,
      providerTransactionId:row.provider_transaction_id??undefined,providerVerifiedPayload:row.provider_verified_payload,
      providerFee:row.provider_fee_minor===null?undefined:Money.of(BigInt(row.provider_fee_minor),row.provider_fee_currency!),
      conversionSnapshot:parseConversionSnapshot(row.conversion_snapshot),
      providerInitialization:row.provider_initialization as PaymentRecord["providerInitialization"]}:null;
  }
  async findPendingByProviderOlderThan(providerName:string,before:Date,limit:number):Promise<readonly PaymentRecord[]>{
    const rows=(await this.sql.query<{id:string}>(`select id from payment_capability.payments where provider_name=$1 and state='pending' and created_at<$2 order by created_at,id limit $3`,[providerName,before,limit])).rows;
    return Promise.all(rows.map(row=>this.findById(row.id))).then(values=>values.filter((value):value is PaymentRecord=>value!==null));
  }
  async findInitializationWork(limit=50):Promise<readonly PaymentRecord[]> {
    const rows=(await this.sql.query<{id:string}>(`select id from payment_capability.payments where state in ('initialization_pending','initialization_failed') order by created_at,id limit $1`,[limit])).rows;
    return Promise.all(rows.map(row=>this.findById(row.id))).then(values=>values.filter((value):value is PaymentRecord=>value!==null));
  }
  async findVerificationWork(limit=50):Promise<readonly PaymentRecord[]> {const rows=(await this.sql.query<{id:string}>(`select id from payment_capability.payments where state='verification_pending' order by updated_at,id limit $1`,[limit])).rows;return Promise.all(rows.map(row=>this.findById(row.id))).then(values=>values.filter((value):value is PaymentRecord=>value!==null));}
}
function parseConversionSnapshot(value:unknown):PaymentRecord["conversionSnapshot"]|undefined {if(!value||typeof value!=="object")return undefined;const v=value as Record<string,unknown>;if(typeof v.fromCurrency!=="string"||typeof v.toCurrency!=="string"||typeof v.rate!=="string"||typeof v.source!=="string"||typeof v.observedAt!=="string")return undefined;const observedAt=new Date(v.observedAt);if(Number.isNaN(observedAt.getTime()))return undefined;return {fromCurrency:v.fromCurrency,toCurrency:v.toCurrency,rate:v.rate,source:v.source,sourceDate:typeof v.sourceDate==="string"?v.sourceDate:undefined,observedAt};}
