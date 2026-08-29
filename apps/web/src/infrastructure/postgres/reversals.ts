import type {SqlExecutor} from "./database";
import type {ReversalRecord,ReversalRepository} from "@/processors/purchase-reversal";
export class PostgresReversalRepository implements ReversalRepository {
  constructor(private readonly sql:SqlExecutor){}
  async findByPurchaseId(purchaseId:string){const row=(await this.sql.query<any>(`select id,purchase_id,distribution_id,state,reason,source,idempotency_key,correlation_id,processed_at from ledger_capability.reversals where purchase_id=$1`,[purchaseId])).rows[0];return row?this.map(row):null;}
  async create(value:Omit<ReversalRecord,"processedAt">){await this.sql.query(`insert into ledger_capability.reversals(id,purchase_id,distribution_id,state,reason,source,idempotency_key,correlation_id,processed_at) values($1,$2,$3,$4,$5,$6,$7,$8,now())`,[value.id,value.purchaseId,value.distributionId,value.state,value.reason,value.source,value.idempotencyKey,value.correlationId]);}
  private map(row:any):ReversalRecord{return {id:row.id,purchaseId:row.purchase_id,distributionId:row.distribution_id,state:row.state,reason:row.reason,source:row.source,idempotencyKey:row.idempotency_key,correlationId:row.correlation_id,processedAt:row.processed_at};}
}
