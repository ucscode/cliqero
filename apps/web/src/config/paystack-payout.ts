import {z} from "zod";
import type {PaystackPayoutConfiguration} from "@/modules/withdrawal/paystack-payout";
import {parseYamlConfiguration,resolveEnvironmentPlaceholders} from "./yaml";
const configSchema=z.object({enabled:z.boolean().default(false),secret_key:z.string().min(1).optional()});
export function loadPaystackPayoutConfiguration():PaystackPayoutConfiguration|null {
  const path="config/modules/payout/paystack.yaml";
  const raw=parseYamlConfiguration(path); if(raw===null)return null;
  const enabledConfig=configSchema.parse(raw); if(!enabledConfig.enabled)return null;
  const config=configSchema.parse(resolveEnvironmentPlaceholders(raw,process.env,path));
  if(!config.secret_key)throw new Error("Paystack payout configuration requires secret_key when enabled");
  return {secretKey:config.secret_key,apiBaseUrl:"https://api.paystack.co",enabled:true};
}
