import type {Money} from "@/modules/money/money";
import {Money as PreciseMoney} from "@/modules/money/money";
import type {Purchase} from "@/modules/purchase/purchase";
import type {ReferralGraphRepository} from "./referral";

export interface CommissionDistributionFact {recipientAccountId:string;level:number;basis:"listing-referral";configuredRateBasisPoints:number;calculatedAmount:Money;}
export class CommissionPolicy {
  constructor(readonly ratesBasisPoints:readonly number[]){
    if(ratesBasisPoints.length>32||ratesBasisPoints.some(rate=>!Number.isInteger(rate)||rate<0||rate>10000))throw new Error("Commission rates are invalid");
  }
  get maximumRewardedDepth(){return this.ratesBasisPoints.length;}
}
export interface CommissionPolicyRepository {getActive():Promise<CommissionPolicy>;}
export class CommissionDistributionService {
  constructor(private readonly graph:ReferralGraphRepository){}
  async calculate(purchase:Purchase,policy:CommissionPolicy):Promise<readonly CommissionDistributionFact[]>{
    if(purchase.state!=="completed")throw new Error("Commission distribution requires a completed purchase");
    const source=purchase.terms.referralReferrerAccountId;if(!source||policy.maximumRewardedDepth===0)return [];
    const recipients=[{accountId:source,depth:1}];
    if(policy.maximumRewardedDepth>1){const uplines=await this.graph.getUplines(source,policy.maximumRewardedDepth-1);
      recipients.push(...uplines.map(item=>({accountId:item.accountId,depth:item.depth+1})));}
    const gross=PreciseMoney.of(BigInt(purchase.terms.canonicalPrice.minorAmount),purchase.terms.canonicalPrice.currency);
    return recipients.map(recipient=>{const rate=policy.ratesBasisPoints[recipient.depth-1]??0;return {recipientAccountId:recipient.accountId,
      level:recipient.depth,basis:"listing-referral" as const,configuredRateBasisPoints:rate,
      calculatedAmount:PreciseMoney.of(gross.minorAmount*BigInt(rate)/10000n,gross.currency)};}).filter(fact=>fact.configuredRateBasisPoints>0);
  }
}
