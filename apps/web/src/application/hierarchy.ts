import {z} from "zod";
import type {SqlExecutor} from "@/infrastructure/postgres/database";
import {loadYamlConfiguration} from "@/config/yaml";

const visualizationSchema=z.object({hierarchy:z.object({visualization:z.object({depth:z.number().int().min(1),child_limit:z.number().int().min(1)})})});
export interface VisualizationConfig {depth:number;childLimit:number;}
export interface HierarchyNode {id:string;handle:string;displayName:string|null;depth:number;directChildCount:number;hasChildren:boolean;hasMoreChildren:boolean;}
export interface HierarchyParent {id:string;handle:string;displayName:string|null;canNavigate:boolean;}
export interface HierarchyTree {root:string;windowDepth:number;childLimit:number;parent:HierarchyParent|null;nodes:HierarchyNode[];edges:{parent:string;child:string}[];}
export interface HierarchyChildren {parentId:string;items:HierarchyNode[];nextCursor:string|null;}

export function visualizationConfig(path="config/hierarchy/visualization.yaml"):VisualizationConfig {
  const value=loadYamlConfiguration(path,process.env,{required:true});
  return visualizationConfigFromValue(value);
}
export function visualizationConfigFromValue(value:unknown):VisualizationConfig {
  const parsed=visualizationSchema.safeParse(value);
  if(!parsed.success)throw new Error(`Invalid hierarchy visualization configuration: ${parsed.error.issues.map(issue=>issue.path.join(".")).join(", ")}`);
  return {depth:parsed.data.hierarchy.visualization.depth,childLimit:parsed.data.hierarchy.visualization.child_limit};
}

export class HierarchyService {
  private readonly config:VisualizationConfig;
  constructor(private readonly sql:SqlExecutor){this.config=visualizationConfig();}
  async isDescendantOrSelf(ancestor:string,candidate:string){const r=await this.sql.query(`with recursive tree(id,path) as (select $1::uuid,array[$1::uuid] union all select ar.child_account_id,tree.path||ar.child_account_id from tree join referral_capability.account_referrals ar on ar.parent_account_id=tree.id where not ar.child_account_id=any(tree.path)) select 1 from tree where id=$2`,[ancestor,candidate]);return r.rowCount===1;}
  private async assertRoot(requester:string,root:string,admin:boolean){const exists=await this.sql.query(`select 1 from identity_capability.accounts where id=$1`,[root]);if(exists.rowCount!==1)throw new Error("Hierarchy account not found");if(!admin&&!await this.isDescendantOrSelf(requester,root))throw new Error("Forbidden");}
  async tree(requester:string,root:string,admin:boolean):Promise<HierarchyTree>{
    await this.assertRoot(requester,root,admin);
    const rows=await this.sql.query<any>(`with recursive tree(id,parent_id,depth,path) as (
      select $1::uuid,null::uuid,0,array[$1::uuid]
      union all
      select r.child_account_id,r.parent_account_id,tree.depth+1,tree.path||r.child_account_id
      from tree join lateral (select child_account_id,parent_account_id from referral_capability.account_referrals where parent_account_id=tree.id order by child_account_id limit $2) r on true
      where tree.depth < $3 and not r.child_account_id=any(tree.path)
    )
    select tree.id,tree.parent_id,tree.depth,a.handle,a.display_name,
      (select count(*)::int from referral_capability.account_referrals x where x.parent_account_id=tree.id) direct_child_count,
      exists(select 1 from referral_capability.account_referrals x where x.parent_account_id=tree.id) has_children,
      (select count(*) from referral_capability.account_referrals x where x.parent_account_id=tree.id) > $2 has_more_children
    from tree join identity_capability.accounts a on a.id=tree.id order by tree.depth,tree.id`,[root,this.config.childLimit,this.config.depth]);
    const parentRow=await this.sql.query<any>(`select a.id,a.handle,a.display_name from referral_capability.account_referrals r join identity_capability.accounts a on a.id=r.parent_account_id where r.child_account_id=$1`,[root]);
    const parent=parentRow.rows[0]?{id:parentRow.rows[0].id,handle:parentRow.rows[0].handle,displayName:parentRow.rows[0].display_name??null,canNavigate:admin||await this.isDescendantOrSelf(requester,parentRow.rows[0].id)}:null;
    const nodes=rows.rows.map(row=>({id:row.id,handle:row.handle,displayName:row.display_name??null,depth:Number(row.depth),directChildCount:Number(row.direct_child_count),hasChildren:Boolean(row.has_children),hasMoreChildren:Boolean(row.has_more_children)}));
    return {root,windowDepth:this.config.depth,childLimit:this.config.childLimit,parent,nodes,edges:rows.rows.filter((r:any)=>r.parent_id).map((r:any)=>({parent:r.parent_id,child:r.id}))};
  }
  async children(requester:string,parentId:string,admin:boolean,cursor?:string):Promise<HierarchyChildren>{
    await this.assertRoot(requester,parentId,admin);
    const rows=await this.sql.query<any>(`select a.id,a.handle,a.display_name,1::int depth,
      (select count(*)::int from referral_capability.account_referrals x where x.parent_account_id=a.id) direct_child_count,
      exists(select 1 from referral_capability.account_referrals x where x.parent_account_id=a.id) has_children,
      (select count(*) from referral_capability.account_referrals x where x.parent_account_id=a.id) > $3 has_more_children
      from referral_capability.account_referrals r join identity_capability.accounts a on a.id=r.child_account_id
      where r.parent_account_id=$1 and ($2::uuid is null or r.child_account_id>$2::uuid)
      order by r.child_account_id limit $4`,[parentId,cursor??null,this.config.childLimit,this.config.childLimit+1]);
    const visible=rows.rows.slice(0,this.config.childLimit);const nextCursor=rows.rows.length>this.config.childLimit?visible.at(-1)!.id:null;
    return {parentId,items:visible.map(row=>({id:row.id,handle:row.handle,displayName:row.display_name??null,depth:1,directChildCount:Number(row.direct_child_count),hasChildren:Boolean(row.has_children),hasMoreChildren:Boolean(row.has_more_children)})),nextCursor};
  }
  async search(requester:string,q:string,admin:boolean,limit:number){const params:any[]=[q,limit];let scope="";if(!admin){params.push(requester);scope=`and a.id in (with recursive tree(id,path) as (select $3::uuid,array[$3::uuid] union all select ar.child_account_id,tree.path||ar.child_account_id from tree join referral_capability.account_referrals ar on ar.parent_account_id=tree.id where not ar.child_account_id=any(tree.path)) select id from tree)`;}const rows=await this.sql.query<any>(`select a.id,a.handle,a.display_name from identity_capability.accounts a where (a.id::text=$1 or a.handle ilike '%'||$1||'%' or a.email ilike '%'||$1||'%') ${scope} order by a.handle limit $2`,params);return rows.rows.map(r=>({id:r.id,handle:r.handle,displayName:r.display_name??null}));}
}
