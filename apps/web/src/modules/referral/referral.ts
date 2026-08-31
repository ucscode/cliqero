import {DomainInvariantError} from "@/kernel/errors";
import type {Id} from "@/kernel/ids";

export interface ReferralLevel {accountId:Id;depth:number;}
export interface ReferralPage {accounts:readonly Id[];nextCursor:Id|null;}
export interface ReferralGraphRepository {
  assignParent(childAccountId:Id,parentAccountId:Id):Promise<void>;
  getUplines(accountId:Id,maxDepth:number):Promise<readonly ReferralLevel[]>;
  getDirectReferrals(accountId:Id,page:{after?:Id;limit:number}):Promise<ReferralPage>;
  getDownlineAtDepth(accountId:Id,depth:number,page:{after?:Id;limit:number}):Promise<ReferralPage>;
  getRelationshipDepth(ancestorId:Id,descendantId:Id,maxDepth:number):Promise<number|null>;
}
export function assertTraversalDepth(depth:number):void {
  if(!Number.isInteger(depth)||depth<1)throw new DomainInvariantError("Referral traversal depth must be a positive integer");
}
export function assertPageLimit(limit:number):void {
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new DomainInvariantError("Referral page limit must be between 1 and 100");
}
