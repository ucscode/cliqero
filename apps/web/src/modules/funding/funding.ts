import type {Id} from "@/kernel/ids";
import type {Money} from "@/modules/money/money";
import type {PaymentConversionSnapshot} from "@/modules/payment/payment";

export type FundingState="initialization_pending"|"initializing"|"awaiting_payment"|"verification_pending"|"confirmed"|"failed"|"blocked"|"reconciliation_pending";
export interface FundingTransaction {id:Id;accountId:Id;providerName:string;providerReference:string;canonicalAmount:Money;collectionAmount:Money;
  conversionSnapshot?:PaymentConversionSnapshot;state:FundingState;idempotencyKey:string;providerInitialization?:{authorizationUrl?:string;accessCode?:string};confirmedAt?:Date;}
export interface FundingRepository {
  findById(id:Id,options?:{forUpdate?:boolean}):Promise<FundingTransaction|null>;
  findByIdempotency(accountId:Id,key:string):Promise<FundingTransaction|null>;
  findByProviderReference(provider:string,reference:string):Promise<FundingTransaction|null>;
  findWork(state:FundingState,limit?:number):Promise<readonly FundingTransaction[]>;
  save(value:FundingTransaction):Promise<void>;
}
