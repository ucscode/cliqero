import { z } from "zod";
import { parseYamlConfiguration, resolveEnvironmentPlaceholders } from "@/config/yaml";
import {
  validateCurrencyMappingConfig,
  type CurrencyMappingConfig,
} from "@/modules/money/country-currency";
import type { BankTransferConfiguration, BankTransferAccount } from "./provider";
import {
  parsePaymentProviderFilters,
  paymentProviderFiltersSchema,
} from "@/modules/payment/provider-configuration";

const schema = z.object({
  enabled: z.boolean().default(false),
  display_name: z.string().trim().min(1),
  image_url: z.string().trim().min(1),
  description: z.string().trim().min(1),
  filters: paymentProviderFiltersSchema.default({ countries: null }),
  config: z.object({
    instruction: z.string().trim().min(1).optional(),
    media_provider: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
      .optional(),
    currency_mapping: z
      .object({
        enabled: z.boolean().default(false),
        overrides: z.record(z.string(), z.string()).optional(),
      })
      .strict()
      .optional(),
    accounts: z.array(
      z.object({
        id: z.string().regex(/^[a-z0-9_-]{1,50}$/),
        instruction: z.string().trim().min(1).optional(),
        filters: paymentProviderFiltersSchema.default({ countries: null }),
        currency_mapping: z
          .object({
            enabled: z.boolean().default(false),
            overrides: z.record(z.string(), z.string()).optional(),
          })
          .strict()
          .optional(),
        fields: z.array(
          z
            .object({
              key: z.string().regex(/^[a-z0-9_-]{1,80}$/),
              label: z.string().trim().min(1).max(120),
              value: z.string().trim().min(1).max(2000),
              copyable: z.boolean().default(false),
            })
            .strict(),
        ),
      }),
    ),
  }),
});

export function loadBankTransferConfiguration(path = "config/modules/payment/bank_transfer.yaml") {
  const value = parseYamlConfiguration(path);
  if (value === null) return null;
  const config = schema.parse(resolveEnvironmentPlaceholders(value, process.env, path));
  if (!config.enabled) return null;
  const ids = new Set<string>();
  const filters = parsePaymentProviderFilters(config.filters, path);
  for (const account of config.config.accounts) {
    if (ids.has(account.id)) throw new Error(`${path} account IDs must be unique`);
    ids.add(account.id);
    parsePaymentProviderFilters(account.filters, `${path} account ${account.id}`);
  }
  const accounts: BankTransferAccount[] = config.config.accounts.map((account) => ({
    id: account.id,
    ...(account.instruction ? { instruction: account.instruction } : {}),
    fields: account.fields,
    filters: account.filters,
    currencyMapping: validateCurrencyMappingConfig(
      account.currency_mapping as CurrencyMappingConfig | undefined,
    ),
  }));
  const provider: BankTransferConfiguration = {
    accounts,
    ...(config.config.instruction ? { instruction: config.config.instruction } : {}),
    currencyMapping: validateCurrencyMappingConfig(
      config.config.currency_mapping as CurrencyMappingConfig | undefined,
    ),
    displayName: config.display_name,
    imageUrl: config.image_url,
    description: config.description,
    mediaProvider: config.config.media_provider,
  };
  return {
    provider,
    filters,
  };
}
