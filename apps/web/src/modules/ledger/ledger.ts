import type {Money} from "@/modules/money/money";

export type RecipientRole="seller"|"referral"|"platform";
export interface LedgerEntryDraft {id:string;distributionId:string;accountId:string;purchaseId:string;entryType:"purchase-earnings"|"purchase-reversal";
  direction:"credit"|"debit";amount:Money;idempotencyKey:string;correlationId:string;recipientRole:RecipientRole;basis:string;
  referralLevel?:number;balanceState:"pending"|"available";maturityAt?:Date;originalEntryId?:string;reversalId?:string;}
export interface LedgerEntry extends LedgerEntryDraft {createdAt:Date;}
export interface PurchaseDistribution {id:string;purchaseId:string;gross:Money;policySnapshot:unknown;correlationId:string;completedAt:Date;}
export interface FinancialDistributionPolicy {platformAccountId:string;platformRateBasisPoints:number;remainderRecipient:"seller"|"platform";initialBalanceState:"pending"|"available";settlementDelaySeconds:number;}
export interface FinancialDistributionPolicyRepository {getActive():Promise<FinancialDistributionPolicy>;}
export interface LedgerRepository {
  findDistributionByPurchaseId(purchaseId:string):Promise<PurchaseDistribution|null>;
  createDistribution(distribution:Omit<PurchaseDistribution,"completedAt">):Promise<void>;
  append(entries:readonly LedgerEntryDraft[]):Promise<void>;
  findEntriesByPurchaseId(purchaseId:string):Promise<readonly LedgerEntry[]>;
  summarizeAccount(accountId:string):Promise<readonly {currency:string;balanceState:string;amountMinor:bigint}[]>;
}
