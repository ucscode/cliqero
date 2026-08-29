import {z} from "zod";
import type {PaystackConfiguration} from "@/modules/payment/paystack";
import {parseYamlConfiguration,resolveEnvironmentPlaceholders} from "./yaml";

const rawSchema=z.object({enabled:z.boolean().default(false),public_key:z.string().optional(),secret_key:z.string().optional(),callback_url:z.string().optional()});
const configSchema=rawSchema.extend({public_key:z.string().min(1).optional(),secret_key:z.string().min(1).optional(),callback_url:z.url().optional()});

export function loadPaystackConfiguration():PaystackConfiguration|null {
  const path="config/modules/payment/paystack.yaml";
  const raw=parseYamlConfiguration(path); if(raw===null)return null;
  const enabledConfig=rawSchema.parse(raw);
  if(!enabledConfig.enabled)return null;
  const config=configSchema.parse(resolveEnvironmentPlaceholders(raw,process.env,path));
  if(!config.public_key||!config.secret_key||!config.callback_url)throw new Error("Paystack payment configuration requires public_key, secret_key, and callback_url when enabled");
  return {publicKey:config.public_key,secretKey:config.secret_key,apiBaseUrl:"https://api.paystack.co",callbackUrl:config.callback_url};
}
