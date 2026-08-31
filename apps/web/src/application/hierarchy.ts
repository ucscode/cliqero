import type {SqlExecutor} from "@/infrastructure/postgres/database";
import {loadYamlConfiguration} from "@/config/yaml";

export interface HierarchyNode {id:string;handle:string;displayName:string|null;depth:number;directChildCount:number;hasChildren:boolean;hasMoreChildren:boolean;}
export interface HierarchyTree {root:string;windowDepth:number;childLimit:number;parent:HierarchyNode|null;nodes:HierarchyNode[];edges:{parent:string;child:string}[];}

export function visualizationConfig():{depth:number;childLimit:number}{
  const value=loadYamlConfiguration("config/hierarchy/visualization.yaml");
  const raw=(value as any)?.hierarchy?.visualization;
  const depth=Number.isInteger(raw?.depth)&&raw.depth>=1&&raw.depth<=32?raw.depth:3;
  const childLimit=Number.isInteger(raw?.child_limit)&&raw.child_limit>=1&&raw.child_limit<=100?raw.child_limit:50;
  return {depth,childLimit};
}

export class HierarchyService {
  constructor(private readonly sql:SqlExecutor){}
  async isDescendantOrSelf(ancestor:string,candidate:string){const r=await this.sql.query(`with recursive tree(id,path) as (select $1::uuid,array[$1::uuid] union all select ar.child_account_id,tree.path||ar.child_account_id from tree join referral_capability.account_referrals ar on ar.parent_account_id=tree.id where not ar.child_account_id=any(tree.path)) select 1 from tree where id=$2`,[ancestor,candidate]);return r.rowCount===1;}
  async tree(requester:string,root:string,admin:boolean):Promise<HierarchyTree>{
    const cfg=visualizationConfig();
    const exists=await this.sql.query(`select 1 from identity_capability.accounts where id=$1`,[root]);
    if(exists.rowCount!==1)throw new Error("Hierarchy account not found");
    if(!admin&&!await this.isDescendantOrSelf(requester,root))throw new Error("Forbidden");
    const rows=await this.sql.query<any>(`with recursive ranked as (
      select child_account_id,parent_account_id,row_number() over(partition by parent_account_id order by child_account_id)::int child_rank
      from referral_capability.account_referrals
    ), tree(id,parent_id,depth,path) as (
      select $1::uuid,null::uuid,0,array[$1::uuid]
      union all
      select r.child_account_id,r.parent_account_id,tree.depth+1,tree.path||r.child_account_id
      from tree join ranked r on r.parent_account_id=tree.id and r.child_rank <= $2 and tree.depth < $3
      where not r.child_account_id=any(tree.path)
    )
    select tree.id,tree.parent_id,tree.depth,a.handle,a.display_name,
      (select count(*)::int from referral_capability.account_referrals x where x.parent_account_id=tree.id) direct_child_count,
      exists(select 1 from referral_capability.account_referrals x where x.parent_account_id=tree.id) has_children,
      (select count(*) from referral_capability.account_referrals x where x.parent_account_id=tree.id) > $2 has_more_children
    from tree join identity_capability.accounts a on a.id=tree.id order by tree.depth,tree.id`,[root,cfg.childLimit,cfg.depth]);
    const parentRow=await this.sql.query<any>(`select a.id,a.handle,a.display_name from referral_capability.account_referrals r join identity_capability.accounts a on a.id=r.parent_account_id where r.child_account_id=$1`,[root]);
    const nodes=rows.rows.map(row=>({id:row.id,handle:row.handle,displayName:row.display_name??null,depth:Number(row.depth),directChildCount:Number(row.direct_child_count),hasChildren:Boolean(row.has_children),hasMoreChildren:Boolean(row.has_more_children)}));
    return {root,windowDepth:cfg.depth,childLimit:cfg.childLimit,parent:parentRow.rows[0]?{id:parentRow.rows[0].id,handle:parentRow.rows[0].handle,displayName:parentRow.rows[0].display_name??null,depth:-1,directChildCount:0,hasChildren:true,hasMoreChildren:false}:null,nodes,edges:rows.rows.filter((r:any)=>r.parent_id).map((r:any)=>({parent:r.parent_id,child:r.id}))};
  }
  async search(requester:string,q:string,admin:boolean,limit:number){const params:any[]=[q,limit];let scope="";if(!admin){params.push(requester);scope=`and a.id in (with recursive tree(id,path) as (select $3::uuid,array[$3::uuid] union all select ar.child_account_id,tree.path||ar.child_account_id from tree join referral_capability.account_referrals ar on ar.parent_account_id=tree.id where not ar.child_account_id=any(tree.path)) select id from tree)`;}const rows=await this.sql.query<any>(`select a.id,a.handle,a.display_name from identity_capability.accounts a where (a.id::text=$1 or a.handle ilike '%'||$1||'%' or a.email ilike '%'||$1||'%') ${scope} order by a.handle limit $2`,params);return rows.rows.map(r=>({id:r.id,handle:r.handle,displayName:r.display_name??null}));}
}
