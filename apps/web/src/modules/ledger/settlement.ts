import type {Money} from "@/modules/money/money";
import type {SqlExecutor} from "@/infrastructure/postgres/database";
import type {LedgerRepository} from "./ledger";
import {newId} from "@/kernel/ids";
import type {UnitOfWork} from "@/kernel/unit-of-work";

export interface SettlementPolicy {defaultBalanceState:"pending"|"available";settlementDelaySeconds:number;}
export interface SettlementPolicyRepository {getActive():Promise<SettlementPolicy>;}
export interface SettlementResult {claimed:number;settled:number;}
export class SettlementProcessor {
  constructor(private readonly sql:SqlExecutor,private readonly uow:UnitOfWork,private readonly ledger:LedgerRepository,private readonly policy:SettlementPolicyRepository){}
  async settle(input:{now?:Date;batchSize?:number}={}):Promise<SettlementResult>{
    const policy=await this.policy.getActive();if(policy.defaultBalanceState!=="pending")return {claimed:0,settled:0};
    const now=input.now??new Date(),limit=input.batchSize??100;if(limit<1||limit>1000)throw new Error("Invalid settlement batch size");
    return this.uow.transaction(async()=>{
      const rows=await this.sql.query<{id:string}>(`select entry.id from ledger_capability.entries entry
        left join ledger_capability.entry_settlements settlement on settlement.original_entry_id=entry.id
        where entry.balance_state='pending' and entry.maturity_at is not null and entry.maturity_at <= $1 and settlement.id is null
        order by entry.maturity_at,entry.id limit $2 for update of entry skip locked`,[now,limit]);
      const ids=rows.rows.map(()=>newId());
      // The row lock above bounds the batch; use one VALUES statement to avoid N+1 writes.
      const values=rows.rows.map((row,index)=>`($${index*3+1}::uuid,$${index*3+2}::uuid,'pending','available',$${index*3+3},$${rows.rows.length*3+1})`).join(",");
      if(!values)return {claimed:rows.rowCount??0,settled:0};
      const params:unknown[]=rows.rows.flatMap((row,index)=>[ids[index],row.id,`settlement:${row.id}`]);params.push(now);
      const bulk=await this.sql.query(`insert into ledger_capability.entry_settlements(id,original_entry_id,from_state,to_state,idempotency_key,settled_at) values ${values} on conflict(original_entry_id) do nothing`,params);
      return {claimed:rows.rowCount??0,settled:bulk.rowCount??0};
    });
  }
}

export class PostgresSettlementPolicyRepository implements SettlementPolicyRepository {
  constructor(private readonly sql:SqlExecutor){}
  async getActive(){const row=(await this.sql.query<{initial_balance_state:"pending"|"available";settlement_delay_seconds:number}>(
    `select initial_balance_state,settlement_delay_seconds from ledger_capability.distribution_policy where singleton=true`)).rows[0];
    return {defaultBalanceState:row?.initial_balance_state??"pending",settlementDelaySeconds:row?.settlement_delay_seconds??0};}
}
