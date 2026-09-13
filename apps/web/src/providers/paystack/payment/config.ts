import { z } from "zod";
import type { PaystackConfiguration } from "./provider";
import type { PaymentProviderFilters } from "@/modules/payment/payment";
import { parseYamlConfiguration, resolveEnvironmentPlaceholders } from "@/config/yaml";
import {
  parsePaymentProviderFilters,
  paymentProviderFiltersSchema,
} from "@/modules/payment/provider-configuration";
const rawSchema = z.object({
  enabled: z.boolean().default(false),
  config: z.record(z.string(), z.unknown()).default({}),
  filters: paymentProviderFiltersSchema.optional(),
});
const configSchema = z.object({
  enabled: z.boolean(),
  display_name: z.string().trim().min(1),
  image_url: z.string().trim().min(1),
  description: z.string().trim().min(1),
  config: z
    .object({
      public_key: z.string().min(1),
      secret_key: z.string().min(1),
      callback_url: z.url(),
      currencies: z.array(z.string().regex(/^[A-Za-z]{3}$/)).min(1),
      default_currency: z.string().regex(/^[A-Za-z]{3}$/),
    })
    .strict(),
  filters: paymentProviderFiltersSchema.default({ countries: null }),
});

export interface LoadedPaystackConfiguration {
  provider: PaystackConfiguration;
  filters: PaymentProviderFilters;
}
export function loadPaystackConfiguration(
  path = "config/modules/payment/paystack.yaml",
  environment: Record<string, string | undefined> = process.env,
): LoadedPaystackConfiguration | null {
  const raw = parseYamlConfiguration(path);
  if (raw === null) return null;
  const enabledConfig = rawSchema.parse(raw);
  if (!enabledConfig.enabled) return null;
  const config = configSchema.parse(resolveEnvironmentPlaceholders(raw, environment, path));
  if (!config.config.public_key || !config.config.secret_key || !config.config.callback_url)
    throw new Error(
      "Paystack payment configuration requires public_key, secret_key, and callback_url when enabled",
    );
  const filters = parsePaymentProviderFilters(config.filters, path);
  return {
    provider: {
      publicKey: config.config.public_key,
      secretKey: config.config.secret_key,
      apiBaseUrl: "https://api.paystack.co",
      callbackUrl: config.config.callback_url,
      displayName: config.display_name,
      imageUrl: config.image_url,
      description: config.description,
      currencies: normalizeCurrencies(config.config.currencies, path),
      defaultCurrency: normalizeDefaultCurrency(
        config.config.default_currency,
        config.config.currencies,
        path,
      ),
    },
    filters,
  };
}

function normalizeCurrencies(currencies: string[], path: string) {
  const normalized = [...new Set(currencies.map((currency) => currency.trim().toUpperCase()))];
  if (normalized.length === 0 || normalized.some((currency) => !/^[A-Z]{3}$/.test(currency)))
    throw new Error(`${path} config.currencies must contain ISO-style three-letter codes`);
  return normalized;
}

function normalizeDefaultCurrency(defaultCurrency: string, currencies: string[], path: string) {
  const normalized = defaultCurrency.trim().toUpperCase();
  if (!normalizeCurrencies(currencies, path).includes(normalized))
    throw new Error(`${path} config.default_currency must be included in config.currencies`);
  return normalized;
}
