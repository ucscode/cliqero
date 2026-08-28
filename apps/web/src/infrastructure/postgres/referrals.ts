import type {SqlExecutor} from "./database";
import {assertPageLimit,assertTraversalDepth,type ReferralGraphRepository,type ReferralLevel,type ReferralPage} from "@/modules/referral/referral";
import {CommissionPolicy,type CommissionPolicyRepository} from "@/modules/referral/commission";

export class PostgresReferralGraphRepository implements ReferralGraphRepository {
  constructor(private readonly sql:SqlExecutor){}
  async assignParent(childAccountId:string,parentAccountId:string):Promise<void>{
    await this.sql.query(`insert into referral_capability.account_referrals(child_account_id,parent_account_id) values($1,$2)`,[childAccountId,parentAccountId]);
  }
  async getUplines(accountId:string,maxDepth:number):Promise<readonly ReferralLevel[]>{
    assertTraversalDepth(maxDepth);
    const result=await this.sql.query<{account_id:string;depth:number}>(
      `with recursive uplines(account_id,depth,path) as (
         select parent_account_id,1,array[$1::uuid,parent_account_id]
         from referral_capability.account_referrals where child_account_id=$1
         union all
         select relationship.parent_account_id,upline.depth+1,upline.path||relationship.parent_account_id
         from uplines upline
         join referral_capability.account_referrals relationship on relationship.child_account_id=upline.account_id
         where upline.depth<$2 and not relationship.parent_account_id=any(upline.path)
       ) select account_id,depth from uplines order by depth`,[accountId,maxDepth]);
    return result.rows.map(row=>({accountId:row.account_id,depth:row.depth}));
  }
  async getDirectReferrals(accountId:string,page:{after?:string;limit:number}):Promise<ReferralPage>{
    assertPageLimit(page.limit);const result=await this.sql.query<{account_id:string}>(
      `select child_account_id account_id from referral_capability.account_referrals
       where parent_account_id=$1 and ($2::uuid is null or child_account_id>$2::uuid)
       order by child_account_id limit $3`,[accountId,page.after??null,page.limit+1]);return paginate(result.rows,page.limit);
  }
  async getDownlineAtDepth(accountId:string,depth:number,page:{after?:string;limit:number}):Promise<ReferralPage>{
    assertTraversalDepth(depth);assertPageLimit(page.limit);
    const result=await this.sql.query<{account_id:string}>(
      `with recursive downline(account_id,depth,path) as (
         select child_account_id,1,array[$1::uuid,child_account_id]
         from referral_capability.account_referrals where parent_account_id=$1
         union all
         select relationship.child_account_id,downline.depth+1,downline.path||relationship.child_account_id
         from downline
         join referral_capability.account_referrals relationship on relationship.parent_account_id=downline.account_id
         where downline.depth<$2 and not relationship.child_account_id=any(downline.path)
       ) select account_id from downline
       where depth=$2 and ($3::uuid is null or account_id>$3::uuid)
       order by account_id limit $4`,[accountId,depth,page.after??null,page.limit+1]);return paginate(result.rows,page.limit);
  }
  async getRelationshipDepth(ancestorId:string,descendantId:string,maxDepth:number):Promise<number|null>{
    assertTraversalDepth(maxDepth);const result=await this.sql.query<{depth:number}>(
      `with recursive uplines(account_id,depth,path) as (
         select parent_account_id,1,array[$2::uuid,parent_account_id]
         from referral_capability.account_referrals where child_account_id=$2
         union all
         select relationship.parent_account_id,upline.depth+1,upline.path||relationship.parent_account_id
         from uplines upline join referral_capability.account_referrals relationship on relationship.child_account_id=upline.account_id
         where upline.depth<$3 and not relationship.parent_account_id=any(upline.path)
       ) select depth from uplines where account_id=$1 order by depth limit 1`,[ancestorId,descendantId,maxDepth]);
    return result.rows[0]?.depth??null;
  }
}
export class PostgresCommissionPolicyRepository implements CommissionPolicyRepository {
  constructor(private readonly sql:SqlExecutor){}
  async getActive():Promise<CommissionPolicy>{const row=(await this.sql.query<{rates_basis_points:number[]}>(
    `select rates_basis_points from referral_capability.commission_policy where singleton=true`)).rows[0];
    return new CommissionPolicy(row?.rates_basis_points??[]);}
}
function paginate(rows:readonly {account_id:string}[],limit:number):ReferralPage{
  const visible=rows.slice(0,limit);return {accounts:visible.map(row=>row.account_id),nextCursor:rows.length>limit?visible.at(-1)!.account_id:null};
}
