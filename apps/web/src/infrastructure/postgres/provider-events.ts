import type {SqlExecutor} from "./database";

export type ProviderEventState="received"|"processed"|"rejected"|"ignored";
export interface ProviderEventRecord {id:string;providerName:string;eventKey:string;eventType:string;providerReference:string|null;
 amountMinor:string|null;currency:string|null;payload:unknown;state:ProviderEventState;lastError:string|null;}
interface ProviderEventRow {id:string;provider_name:string;event_key:string;event_type:string;provider_reference:string|null;
 amount_minor:string|null;currency:string|null;payload:unknown;state:ProviderEventState;last_error:string|null;}
export class PostgresProviderEventRepository {
  constructor(private readonly sql:SqlExecutor){}
  async record(event:Omit<ProviderEventRecord,"state"|"lastError">):Promise<{record:ProviderEventRecord;created:boolean}> {
    const result=await this.sql.query<ProviderEventRow>(
      `insert into payment_capability.provider_events
       (id,provider_name,event_key,event_type,provider_reference,amount_minor,currency,payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       on conflict (provider_name,event_key) do nothing
       returning id,provider_name,event_key,event_type,provider_reference,amount_minor,currency,payload,state,last_error`,
      [event.id,event.providerName,event.eventKey,event.eventType,event.providerReference,event.amountMinor,event.currency,JSON.stringify(event.payload)]);
    if(result.rows[0])return {record:this.map(result.rows[0]),created:true};
    const existing=await this.findByIdentity(event.providerName,event.eventKey);if(!existing)throw new Error("Provider event conflict could not be resolved");
    return {record:existing,created:false};
  }
  async findById(id:string):Promise<ProviderEventRecord|null>{
    const row=(await this.sql.query<ProviderEventRow>(
      `select id,provider_name,event_key,event_type,provider_reference,amount_minor,currency,payload,state,last_error
       from payment_capability.provider_events where id=$1`,[id])).rows[0];return row?this.map(row):null;
  }
  async markProcessed(id:string):Promise<void>{await this.sql.query(
    `update payment_capability.provider_events set state='processed',processed_at=now(),last_error=null where id=$1`,[id]);}
  async markIgnored(id:string,reason:string):Promise<void>{await this.sql.query(
    `update payment_capability.provider_events set state='ignored',processed_at=now(),last_error=$2 where id=$1`,[id,reason.slice(0,4000)]);}
  async markRejected(id:string,reason:string):Promise<void>{await this.sql.query(
    `update payment_capability.provider_events set state='rejected',processed_at=now(),last_error=$2 where id=$1`,[id,reason.slice(0,4000)]);}
  private async findByIdentity(provider:string,key:string):Promise<ProviderEventRecord|null>{
    const row=(await this.sql.query<ProviderEventRow>(
      `select id,provider_name,event_key,event_type,provider_reference,amount_minor,currency,payload,state,last_error
       from payment_capability.provider_events where provider_name=$1 and event_key=$2`,[provider,key])).rows[0];return row?this.map(row):null;
  }
  private map(row:ProviderEventRow):ProviderEventRecord{return {id:row.id,providerName:row.provider_name,eventKey:row.event_key,eventType:row.event_type,
    providerReference:row.provider_reference,amountMinor:row.amount_minor,currency:row.currency,payload:row.payload,state:row.state,lastError:row.last_error};}
}
