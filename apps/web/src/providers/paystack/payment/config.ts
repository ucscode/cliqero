import {z} from "zod";
import type {PaystackConfiguration} from "./provider";
import type {PaymentProviderFilters} from "@/modules/payment/payment";
import {parseYamlConfiguration,resolveEnvironmentPlaceholders} from "@/config/yaml";

const filterSchema=z.object({countries:z.array(z.string()).nullable().default(null),currencies:z.array(z.string()).nullable().default(null)});
const rawSchema=z.object({enabled:z.boolean().default(false),config:z.record(z.string(),z.unknown()).default({}),filters:filterSchema.optional()});
const configSchema=z.object({enabled:z.boolean(),config:z.object({public_key:z.string().min(1),secret_key:z.string().min(1),callback_url:z.url()}),filters:filterSchema.default({countries:null,currencies:null})});

export interface LoadedPaystackConfiguration {provider:PaystackConfiguration;filters:PaymentProviderFilters;}
export function loadPaystackConfiguration():LoadedPaystackConfiguration|null {
  const path="config/modules/payment/paystack.yaml";
  const raw=parseYamlConfiguration(path); if(raw===null)return null;
  const enabledConfig=rawSchema.parse(raw);
  if(!enabledConfig.enabled)return null;
  const config=configSchema.parse(resolveEnvironmentPlaceholders(raw,process.env,path));
  if(!config.config.public_key||!config.config.secret_key||!config.config.callback_url)throw new Error("Paystack payment configuration requires public_key, secret_key, and callback_url when enabled");
  const countries=config.filters?.countries??null,currencies=config.filters?.currencies??null;
  for(const code of countries??[])if(!/^[A-Z]{2}$/.test(code))throw new Error("Paystack countries filters must use uppercase ISO alpha-2 codes");
  for(const code of currencies??[])if(!/^[A-Z]{3}$/.test(code))throw new Error("Paystack currencies filters must use uppercase ISO 4217 codes");
  return {provider:{publicKey:config.config.public_key,secretKey:config.config.secret_key,apiBaseUrl:"https://api.paystack.co",callbackUrl:config.config.callback_url},filters:{countries,currencies}};
}
