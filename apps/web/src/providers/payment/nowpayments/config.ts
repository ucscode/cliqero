import { z } from "zod";
import { parseYamlConfiguration, resolveEnvironmentPlaceholders } from "@/config/yaml";
import type { NowPaymentsConfiguration } from "./provider";
import { isNowPaymentsSandboxApi, NOWPAYMENTS_SANDBOX_CASES } from "./provider";
import { parsePaymentProviderFilters, paymentProviderFiltersSchema } from "@/modules/payment";
const raw = z.object({
  enabled: z.boolean().default(false),
  config: z.record(z.string(), z.unknown()).default({}),
  filters: paymentProviderFiltersSchema.optional(),
});
const loaded = z.object({
  enabled: z.boolean(),
  display_name: z.string().trim().min(1),
  image_url: z.string().trim().min(1),
  description: z.string().trim().min(1),
  config: z
    .object({
      api_key: z.string().min(1),
      ipn_secret: z.string().min(1).optional(),
      api_base_url: z.url().default("https://api.nowpayments.io"),
      ipn_callback_url: z.url().optional(),
      pay_currencies: z.array(z.string().min(1)).min(1),
      asset: z.string().optional(),
      network: z.string().optional(),
      sandbox: z
        .object({
          case: z.enum(NOWPAYMENTS_SANDBOX_CASES),
        })
        .strict()
        .nullable()
        .optional(),
    })
    .strict(),
  filters: paymentProviderFiltersSchema.default({ countries: null }),
});

export function loadNowPaymentsConfiguration(
  path: string,
  environment: Record<string, string | undefined> = process.env,
) {
  const value = parseYamlConfiguration(path);
  if (value === null) return null;
  const initial = raw.parse(value);
  if (!initial.enabled) return null;
  const config = loaded.parse(resolveEnvironmentPlaceholders(value, environment, path));
  if (config.config.sandbox && !isNowPaymentsSandboxApi(config.config.api_base_url))
    throw new Error(
      "NOWPayments sandbox.case requires api_base_url=https://api-sandbox.nowpayments.io",
    );
  const filters = parsePaymentProviderFilters(config.filters, path);
  const payCurrencies = normalizeCurrencies(config.config.pay_currencies);
  const provider: NowPaymentsConfiguration = {
    apiKey: config.config.api_key,
    ipnSecret: config.config.ipn_secret,
    apiBaseUrl: config.config.api_base_url,
    ipnCallbackUrl: config.config.ipn_callback_url
      ? normalizeCallbackUrl(config.config.ipn_callback_url)
      : undefined,
    payCurrencies,
    displayName: config.display_name,
    imageUrl: config.image_url,
    description: config.description,
    asset: config.config.asset,
    network: config.config.network,
    sandbox: config.config.sandbox ? { case: config.config.sandbox.case } : undefined,
  };
  return { provider, filters };
}

function normalizeCallbackUrl(value: string) {
  const url = new URL(value.trim());
  url.pathname = `/${url.pathname.replace(/^\/+/, "")}`;
  return url.toString();
}

function normalizeCurrencies(currencies: string[]) {
  const normalized = currencies.map((currency) => currency.trim().toLowerCase());
  if (normalized.some((currency) => !/^[a-z0-9_-]+$/.test(currency)))
    throw new Error("NOWPayments payment currencies contain an invalid value");
  return [...new Set(normalized)];
}
