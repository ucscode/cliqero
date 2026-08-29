import {Money} from "@/modules/money/money";
import type {FinancialDistributionPolicy,FinancialDistributionPolicyRepository,LedgerEntry,LedgerEntryDraft,LedgerRepository,PurchaseDistribution} from "@/modules/ledger/ledger";
import type {SqlExecutor} from "./database";

export class PostgresFinancialDistributionPolicyRepository implements FinancialDistributionPolicyRepository {
  constructor(private readonly sql:SqlExecutor){}
  async getActive():Promise<FinancialDistributionPolicy>{
    const row=(await this.sql.query<{platform_account_id:string;platform_rate_basis_points:number;remainder_recipient:"seller"|"platform";initial_balance_state:"pending"|"available";settlement_delay_seconds:number}>(
      `select platform_account_id,platform_rate_basis_points,remainder_recipient,initial_balance_state,settlement_delay_seconds from ledger_capability.distribution_policy where singleton=true`)).rows[0];
    if(!row)throw new Error("Financial distribution policy is not configured");
    return {platformAccountId:row.platform_account_id,platformRateBasisPoints:row.platform_rate_basis_points,remainderRecipient:row.remainder_recipient,initialBalanceState:row.initial_balance_state,settlementDelaySeconds:row.settlement_delay_seconds};
  }
}

interface DistributionRow{id:string;purchase_id:string;gross_minor:string;currency:string;policy_snapshot:unknown;correlation_id:string;completed_at:Date;}
interface EntryRow{id:string;distribution_id:string;account_id:string;purchase_id:string;entry_type:"purchase-earnings"|"purchase-reversal";direction:"credit"|"debit";amount_minor:string;
 currency:string;idempotency_key:string;correlation_id:string;recipient_role:"seller"|"referral"|"platform";basis:string;referral_level:number|null;balance_state:"pending"|"available";maturity_at:Date|null;original_entry_id:string|null;reversal_id:string|null;created_at:Date;}
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
    `insert into ledger_capability.entries(id,distribution_id,account_id,purchase_id,entry_type,direction,amount_minor,currency,idempotency_key,correlation_id,recipient_role,basis,referral_level,balance_state,maturity_at,original_entry_id,reversal_id)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,[entry.id,entry.distributionId,entry.accountId,entry.purchaseId,entry.entryType,entry.direction,
      entry.amount.minorAmount.toString(),entry.amount.currency,entry.idempotencyKey,entry.correlationId,entry.recipientRole,entry.basis,entry.referralLevel??null,entry.balanceState,entry.maturityAt??null,entry.originalEntryId??null,entry.reversalId??null]);}
  async findEntriesByPurchaseId(purchaseId:string):Promise<readonly LedgerEntry[]>{const rows=(await this.sql.query<EntryRow>(
    `select id,distribution_id,account_id,purchase_id,entry_type,direction,amount_minor,currency,idempotency_key,correlation_id,recipient_role,basis,referral_level,balance_state,created_at,
      maturity_at,original_entry_id,reversal_id
     from ledger_capability.entries where purchase_id=$1 order by created_at,id`,[purchaseId])).rows;return rows.map(row=>({id:row.id,distributionId:row.distribution_id,
      accountId:row.account_id,purchaseId:row.purchase_id,entryType:row.entry_type,direction:row.direction,amount:Money.of(BigInt(row.amount_minor),row.currency),
      idempotencyKey:row.idempotency_key,correlationId:row.correlation_id,recipientRole:row.recipient_role,basis:row.basis,referralLevel:row.referral_level??undefined,
      balanceState:row.balance_state,maturityAt:row.maturity_at??undefined,originalEntryId:row.original_entry_id??undefined,reversalId:row.reversal_id??undefined,createdAt:row.created_at}));}
  async summarizeAccount(accountId:string){const rows=(await this.sql.query<{currency:string;balance_state:string;amount_minor:string}>(
    `select entry.currency,case when entry.reversal_id is not null or exists(select 1 from ledger_capability.entries compensation where compensation.original_entry_id=entry.id) then 'reversed' when settlement.id is not null then 'available' when entry.balance_state='pending' then 'pending' else entry.balance_state end balance_state,
      sum(case entry.direction when 'credit' then entry.amount_minor else -entry.amount_minor end)::bigint amount_minor
     from ledger_capability.entries entry left join ledger_capability.entry_settlements settlement on settlement.original_entry_id=entry.id
     where entry.account_id=$1 group by entry.currency,case when entry.reversal_id is not null or exists(select 1 from ledger_capability.entries compensation where compensation.original_entry_id=entry.id) then 'reversed' when settlement.id is not null then 'available' when entry.balance_state='pending' then 'pending' else entry.balance_state end order by entry.currency,balance_state`,[accountId])).rows;
    return rows.map(row=>({currency:row.currency,balanceState:row.balance_state,amountMinor:BigInt(row.amount_minor)}));}
}
