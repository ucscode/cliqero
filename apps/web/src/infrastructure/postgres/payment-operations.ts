import {newId} from "@/kernel/ids";
import type {SqlExecutor} from "./database";

export type ReconciliationState="started"|"completed"|"skipped"|"mismatch"|"failed";
export interface ReconciliationAttempt {id:string;paymentId:string;idempotencyKey:string;state:ReconciliationState;result:unknown;lastError:string|null;actorId:string;correlationId:string;}
interface AttemptRow{id:string;payment_id:string;idempotency_key:string;state:ReconciliationState;result:unknown;last_error:string|null;actor_id:string;correlation_id:string;}
export class PostgresPaymentOperationsRepository {
  constructor(private readonly sql:SqlExecutor){}
  async begin(input:{paymentId:string;idempotencyKey:string;actorId:string;correlationId:string}):Promise<{attempt:ReconciliationAttempt;created:boolean}>{
    const result=await this.sql.query<AttemptRow>(`insert into payment_capability.reconciliation_attempts(id,payment_id,idempotency_key,state,actor_id,correlation_id)
      values($1,$2,$3,'started',$4,$5) on conflict(payment_id,idempotency_key) do nothing
      returning id,payment_id,idempotency_key,state,result,last_error,actor_id,correlation_id`,[newId(),input.paymentId,input.idempotencyKey,input.actorId,input.correlationId]);
    if(result.rows[0])return {attempt:this.map(result.rows[0]),created:true};
    const existing=await this.find(input.paymentId,input.idempotencyKey);if(!existing)throw new Error("Reconciliation conflict could not be resolved");return {attempt:existing,created:false};
  }
  async finish(id:string,state:Exclude<ReconciliationState,"started">,result:unknown,error?:string):Promise<void>{await this.sql.query(
    `update payment_capability.reconciliation_attempts set state=$2,result=$3::jsonb,last_error=$4,completed_at=now() where id=$1`,[id,state,JSON.stringify(result),error?.slice(0,4000)??null]);}
  async listProviderEvents(limit:number){return (await this.sql.query(
    `select event.id,event.event_type,event.provider_reference,event.amount_minor,event.currency,event.state,event.last_error,event.received_at,event.processed_at,
            payment.id payment_id,payment.state payment_state,payment.provider_transaction_id,payment.provider_fee_minor,payment.provider_fee_currency,
            outbox.state outbox_state,outbox.last_error outbox_last_error
     from payment_capability.provider_events event
     left join payment_capability.payments payment on payment.provider_name=event.provider_name and payment.provider_reference=event.provider_reference
     left join kernel.outbox_events outbox on outbox.aggregate_id=event.id and outbox.event_name='payment.paystack.charge-succeeded'
     where event.provider_name='paystack' order by event.received_at desc,event.id limit $1`,[limit])).rows;}
  private async find(paymentId:string,key:string){const row=(await this.sql.query<AttemptRow>(
    `select id,payment_id,idempotency_key,state,result,last_error,actor_id,correlation_id from payment_capability.reconciliation_attempts where payment_id=$1 and idempotency_key=$2`,[paymentId,key])).rows[0];return row?this.map(row):null;}
  private map(row:AttemptRow):ReconciliationAttempt{return {id:row.id,paymentId:row.payment_id,idempotencyKey:row.idempotency_key,state:row.state,result:row.result,lastError:row.last_error,actorId:row.actor_id,correlationId:row.correlation_id};}
}
