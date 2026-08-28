import {Money} from "@/modules/money/money";
import type {FinancialDistributionPolicy,FinancialDistributionPolicyRepository,LedgerEntry,LedgerEntryDraft,LedgerRepository,PurchaseDistribution} from "@/modules/ledger/ledger";
import type {SqlExecutor} from "./database";

export class PostgresFinancialDistributionPolicyRepository implements FinancialDistributionPolicyRepository {
  constructor(private readonly sql:SqlExecutor){}
  async getActive():Promise<FinancialDistributionPolicy>{
    const row=(await this.sql.query<{platform_account_id:string;platform_rate_basis_points:number;remainder_recipient:"seller"|"platform"}>(
      `select platform_account_id,platform_rate_basis_points,remainder_recipient from ledger_capability.distribution_policy where singleton=true`)).rows[0];
    if(!row)throw new Error("Financial distribution policy is not configured");
    return {platformAccountId:row.platform_account_id,platformRateBasisPoints:row.platform_rate_basis_points,remainderRecipient:row.remainder_recipient};
  }
}

interface DistributionRow{id:string;purchase_id:string;gross_minor:string;currency:string;policy_snapshot:unknown;correlation_id:string;completed_at:Date;}
interface EntryRow{id:string;distribution_id:string;account_id:string;purchase_id:string;entry_type:"purchase-earnings";direction:"credit";amount_minor:string;
 currency:string;idempotency_key:string;correlation_id:string;recipient_role:"seller"|"referral"|"platform";basis:string;referral_level:number|null;balance_state:"available";created_at:Date;}
export class PostgresLedgerRepository implements LedgerRepository {
  constructor(private readonly sql:SqlExecutor){}
  async findDistributionByPurchaseId(purchaseId:string):Promise<PurchaseDistribution|null>{
    const row=(await this.sql.query<DistributionRow>(`select id,purchase_id,gross_minor,currency,policy_snapshot,correlation_id,completed_at from ledger_capability.purchase_distributions where purchase_id=$1`,[purchaseId])).rows[0];
    return row?{id:row.id,purchaseId:row.purchase_id,gross:Money.of(BigInt(row.gross_minor),row.currency),policySnapshot:row.policy_snapshot,correlationId:row.correlation_id,completedAt:row.completed_at}:null;
  }
  async createDistribution(value:Omit<PurchaseDistribution,"completedAt">):Promise<void>{await this.sql.query(
    `insert into ledger_capability.purchase_distributions(id,purchase_id,gross_minor,currency,policy_snapshot,correlation_id) values($1,$2,$3,$4,$5::jsonb,$6)`,
    [value.id,value.purchaseId,value.gross.minorAmount.toString(),value.gross.currency,JSON.stringify(value.policySnapshot),value.correlationId]);}
  async append(entries:readonly LedgerEntryDraft[]):Promise<void>{for(const entry of entries)await this.sql.query(
    `insert into ledger_capability.entries(id,distribution_id,account_id,purchase_id,entry_type,direction,amount_minor,currency,idempotency_key,correlation_id,recipient_role,basis,referral_level,balance_state)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[entry.id,entry.distributionId,entry.accountId,entry.purchaseId,entry.entryType,entry.direction,
      entry.amount.minorAmount.toString(),entry.amount.currency,entry.idempotencyKey,entry.correlationId,entry.recipientRole,entry.basis,entry.referralLevel??null,entry.balanceState]);}
  async findEntriesByPurchaseId(purchaseId:string):Promise<readonly LedgerEntry[]>{const rows=(await this.sql.query<EntryRow>(
    `select id,distribution_id,account_id,purchase_id,entry_type,direction,amount_minor,currency,idempotency_key,correlation_id,recipient_role,basis,referral_level,balance_state,created_at
     from ledger_capability.entries where purchase_id=$1 order by created_at,id`,[purchaseId])).rows;return rows.map(row=>({id:row.id,distributionId:row.distribution_id,
      accountId:row.account_id,purchaseId:row.purchase_id,entryType:row.entry_type,direction:row.direction,amount:Money.of(BigInt(row.amount_minor),row.currency),
      idempotencyKey:row.idempotency_key,correlationId:row.correlation_id,recipientRole:row.recipient_role,basis:row.basis,referralLevel:row.referral_level??undefined,
      balanceState:row.balance_state,createdAt:row.created_at}));}
  async summarizeAccount(accountId:string){const rows=(await this.sql.query<{currency:string;balance_state:string;amount_minor:string}>(
    `select currency,balance_state,sum(case direction when 'credit' then amount_minor else -amount_minor end)::bigint amount_minor
     from ledger_capability.entries where account_id=$1 group by currency,balance_state order by currency,balance_state`,[accountId])).rows;
    return rows.map(row=>({currency:row.currency,balanceState:row.balance_state,amountMinor:BigInt(row.amount_minor)}));}
}
