import {existsSync,readFileSync} from "node:fs";
import {parse} from "yaml";
import {z} from "zod";
import type {PaystackConfiguration} from "@/modules/payment/paystack";

const moduleSchema=z.object({provider:z.literal("paystack"),enabled_by_default:z.boolean().default(false),
  api_base_url:z.url().default("https://api.paystack.co"),callback_url:z.url().optional()});
const secretSchema=z.object({secret_key:z.string().min(1)});

export function loadPaystackConfiguration(environment:NodeJS.ProcessEnv=process.env):PaystackConfiguration|null {
  const modulePath=environment.PAYSTACK_CONFIG_PATH??"config/modules/payment/paystack.yaml";
  const secretPath=environment.PAYSTACK_SECRETS_PATH??"config/secrets/payment/paystack.yaml";
  if(!existsSync(/* turbopackIgnore: true */ modulePath)||!existsSync(/* turbopackIgnore: true */ secretPath))return null;
  const moduleConfig=moduleSchema.parse(parse(readFileSync(/* turbopackIgnore: true */ modulePath,"utf8")));
  if(!moduleConfig.enabled_by_default)return null;
  const secrets=secretSchema.parse(parse(readFileSync(/* turbopackIgnore: true */ secretPath,"utf8")));
  return {secretKey:secrets.secret_key,apiBaseUrl:moduleConfig.api_base_url,callbackUrl:moduleConfig.callback_url};
}
