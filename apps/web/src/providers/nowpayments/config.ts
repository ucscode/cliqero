import { z } from "zod";
import { parseYamlConfiguration, resolveEnvironmentPlaceholders } from "@/config/yaml";
import type { PaymentProviderFilters } from "@/modules/payment/payment";
import type { NowPaymentsConfiguration } from "./provider";
import { NOWPAYMENTS_SANDBOX_CASES } from "./provider";

const filters = z.object({
  countries: z.array(z.string()).nullable().default(null),
  currencies: z.array(z.string()).nullable().default(null),
});
const raw = z.object({
  enabled: z.boolean().default(false),
  config: z.record(z.string(), z.unknown()).default({}),
  filters: filters.optional(),
});
const loaded = z.object({
  enabled: z.boolean(),
  config: z.object({
    api_key: z.string().min(1),
    ipn_secret: z.string().min(1).optional(),
    api_base_url: z.url().default("https://api.nowpayments.io"),
    ipn_callback_url: z.url().optional(),
    pay_currency: z.string().min(1),
    asset: z.string().optional(),
    network: z.string().optional(),
    sandbox_case: z.enum(NOWPAYMENTS_SANDBOX_CASES).optional(),
  }),
  filters: filters.default({ countries: null, currencies: null }),
});

export function loadNowPaymentsConfiguration(path: string) {
  const value = parseYamlConfiguration(path);
  if (value === null) return null;
  const initial = raw.parse(value);
  if (!initial.enabled) return null;
  const config = loaded.parse(resolveEnvironmentPlaceholders(value, process.env, path));
  validateFilters(config.filters, path);
  const provider: NowPaymentsConfiguration = {
    apiKey: config.config.api_key,
    ipnSecret: config.config.ipn_secret,
    apiBaseUrl: config.config.api_base_url,
    ipnCallbackUrl: config.config.ipn_callback_url,
    payCurrency: config.config.pay_currency,
    asset: config.config.asset,
    network: config.config.network,
    sandboxCase: config.config.sandbox_case,
  };
  return { provider, filters: config.filters as PaymentProviderFilters };
}

function validateFilters(
  value: { countries: string[] | null; currencies: string[] | null },
  path: string,
) {
  for (const code of value.countries ?? [])
    if (!/^[A-Z]{2}$/.test(code))
      throw new Error(`${path} countries must use uppercase ISO alpha-2 codes`);
  for (const code of value.currencies ?? [])
    if (!/^[A-Z]{3}$/.test(code))
      throw new Error(`${path} currencies must use uppercase ISO alpha-3 codes`);
}
