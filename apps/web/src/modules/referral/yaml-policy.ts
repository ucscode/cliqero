import {z} from "zod";
import {loadYamlConfiguration} from "@/config/yaml";
import {CommissionPolicy} from "@/modules/referral/commission";

const levelValue=z.number().int().min(0).max(100);
export function commissionPolicyFromYaml(value:unknown){
  const levels=(value as any)?.distribution?.commission?.levels;
  if(levels===undefined)return new CommissionPolicy([]);
  if(levels===null||typeof levels!=="object"||Array.isArray(levels))throw new Error("distribution.commission.levels must be a YAML mapping");
  const entries=Object.entries(levels).map(([key,raw])=>{if(!/^\d+$/.test(key)||Number(key)<1)throw new Error("Commission levels must start at 1");return [Number(key),levelValue.parse(raw)] as const;}).sort((a,b)=>a[0]-b[0]);
  entries.forEach(([level],index)=>{if(level!==index+1)throw new Error("Commission levels must be contiguous starting at 1");});
  if(entries.reduce((sum,[,rate])=>sum+rate,0)>100)throw new Error("Commission percentages must not exceed 100% total");
  return new CommissionPolicy(entries.map(([,rate])=>rate),"percentage");
}
export function loadYamlCommissionPolicy(path="config/modules/distribution.yaml"){return commissionPolicyFromYaml(loadYamlConfiguration(path,process.env,{required:true}));}
