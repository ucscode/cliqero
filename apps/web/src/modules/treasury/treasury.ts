import {newId} from "@/kernel/ids";
export type TreasuryDirection="credit"|"debit";
export interface TreasuryEntry {id:string;direction:TreasuryDirection;amountMinor:bigint;title:string;note:string|null;sourceKind:string|null;sourceId:string|null;idempotencyKey:string;actorId:string|null;createdAt:Date;}
export interface TreasuryRepository {create(entry: TreasuryEntry):Promise<TreasuryEntry>;findById(id:string):Promise<TreasuryEntry|null>;findByIdempotencyKey(key:string):Promise<TreasuryEntry|null>;findBySource(kind:string,id:string):Promise<TreasuryEntry|null>;list(input:{cursor?:string;limit:number;direction?:TreasuryDirection}):Promise<{items:readonly TreasuryEntry[];nextCursor:string|null}>;summary():Promise<{creditsMinor:bigint;debitsMinor:bigint;balanceMinor:bigint}>;}
export class TreasuryService {
  constructor(private repo:TreasuryRepository){}
  async expense(input:{amountMinor:bigint;title:string;note?:string|null;actorId:string;idempotencyKey:string}){if(input.amountMinor<=0n)throw new Error("Treasury expense must be positive");if(!input.title.trim())throw new Error("Treasury title is required");const prior=await this.repo.findByIdempotencyKey(input.idempotencyKey);if(prior)return prior;return this.repo.create({id:newId(),direction:"debit",amountMinor:input.amountMinor,title:input.title.trim(),note:input.note?.trim()||null,sourceKind:null,sourceId:null,idempotencyKey:input.idempotencyKey,actorId:input.actorId,createdAt:new Date()});}
  async reverse(original:TreasuryEntry,input:{actorId:string;idempotencyKey:string;reason:string}){
    const reason=input.reason.trim();if(!reason)throw new Error("Treasury reversal reason is required");
    const prior=await this.repo.findByIdempotencyKey(input.idempotencyKey);if(prior)return prior;
    const existing=await this.repo.findBySource("treasury_reversal",original.id);if(existing)return existing;
    return this.repo.create({id:newId(),direction:original.direction==="credit"?"debit":"credit",amountMinor:original.amountMinor,title:`Reversal: ${original.title}`,note:reason,sourceKind:"treasury_reversal",sourceId:original.id,idempotencyKey:input.idempotencyKey,actorId:input.actorId,createdAt:new Date()});
  }
}
