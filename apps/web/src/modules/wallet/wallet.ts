import type {Id} from "@/kernel/ids";
import type {Money} from "@/modules/money/money";

export interface WalletSummary {currency:"USD";available:Money;pending:Money;}
export interface WalletCredit {id:Id;accountId:Id;fundingId:Id;amount:Money;state:"pending"|"available";createdAt?:Date;availableAt?:Date;}
export interface WalletDebit {id:Id;accountId:Id;checkoutId:Id;amount:Money;createdAt?:Date;}
export type WalletTransaction={kind:"funding_credit";id:Id;sourceId:Id;amount:Money;state:"pending"|"available";createdAt:Date}|{kind:"purchase_debit";id:Id;sourceId:Id;amount:Money;state:"complete";createdAt:Date};
export interface WalletRepository {
  summary(accountId:Id,options?:{forUpdate?:boolean}):Promise<WalletSummary>;
  findCreditByFunding(fundingId:Id):Promise<WalletCredit|null>;
  findPendingCredits(limit?:number):Promise<readonly WalletCredit[]>;
  createCredit(credit:WalletCredit):Promise<void>;
  makeCreditAvailable(id:Id):Promise<void>;
  findDebitByCheckout(checkoutId:Id):Promise<WalletDebit|null>;
  createDebit(debit:WalletDebit):Promise<void>;
  history(accountId:Id):Promise<readonly WalletTransaction[]>;
  lockAccount(accountId:Id):Promise<void>;
}
