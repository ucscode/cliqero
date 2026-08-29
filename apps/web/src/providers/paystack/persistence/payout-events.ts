import type {SqlExecutor} from "@/infrastructure/postgres/database";
export class PostgresPaystackPayoutEventRepository {
 constructor(private readonly sql:SqlExecutor){}
 async record(input:{id:string;eventKey:string;eventType:string;providerReference:string;amountMinor:string;currency:string;payload:unknown}){const result=await this.sql.query<any>(`insert into payout_capability.paystack_events(id,event_key,event_type,provider_reference,amount_minor,currency,payload) values($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict(event_key) do nothing returning id`,[input.id,input.eventKey,input.eventType,input.providerReference,input.amountMinor,input.currency,JSON.stringify(input.payload)]);return result.rowCount===1;}
 async markIgnored(eventKey:string,reason:string){await this.sql.query(`update payout_capability.paystack_events set ignored_reason=$2 where event_key=$1`,[eventKey,reason]);}
}
