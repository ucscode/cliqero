import {z} from "zod";
import {loadYamlConfiguration} from "@/config/yaml";
import {CommissionPolicy} from "@/modules/referral/commission";

const levelValue=z.number().int().min(0).max(100);
export function commissionPolicyFromYaml(value:unknown){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("distribution.commission.levels configuration is required");
  const distribution=(value as Record<string,unknown>).distribution;
  if(!distribution||typeof distribution!=="object"||Array.isArray(distribution))throw new Error("distribution configuration is required");
  const commission=(distribution as Record<string,unknown>).commission;
  if(!commission||typeof commission!=="object"||Array.isArray(commission))throw new Error("distribution.commission configuration is required");
  if(!Object.prototype.hasOwnProperty.call(commission,"levels"))throw new Error("distribution.commission.levels configuration is required");
  const levels=(commission as Record<string,unknown>).levels;
  if(levels===null)return new CommissionPolicy([]);
  if(typeof levels!=="object"||Array.isArray(levels))throw new Error("distribution.commission.levels must be a YAML mapping");
  const entries=Object.entries(levels).map(([key,raw])=>{if(!/^\d+$/.test(key)||Number(key)<1)throw new Error("Commission levels must start at 1");return [Number(key),levelValue.parse(raw)] as const;}).sort((a,b)=>a[0]-b[0]);
  entries.forEach(([level],index)=>{if(level!==index+1)throw new Error("Commission levels must be contiguous starting at 1");});
  if(entries.reduce((sum,[,rate])=>sum+rate,0)>100)throw new Error("Commission percentages must not exceed 100% total");
  return new CommissionPolicy(entries.map(([,rate])=>rate),"percentage");
}
export function loadYamlCommissionPolicy(path="config/hierarchy/distribution.yaml"){return commissionPolicyFromYaml(loadYamlConfiguration(path,process.env,{required:true}));}
