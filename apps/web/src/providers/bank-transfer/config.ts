import { z } from "zod";
import { parseYamlConfiguration, resolveEnvironmentPlaceholders } from "@/config/yaml";
import type { PaymentProviderFilters } from "@/modules/payment/payment";
import type { BankTransferConfiguration, BankTransferAccount } from "./provider";

const schema = z.object({
  enabled: z.boolean().default(false),
  display_name: z.string().trim().min(1),
  image_url: z.string().trim().min(1),
  description: z.string().trim().min(1),
  config: z.object({
    accounts: z.array(
      z.object({
        id: z.string().regex(/^[a-z0-9_-]{1,50}$/),
        filters: z
          .object({
            countries: z.array(z.string()).nullable().default(null),
            currencies: z.array(z.string()).nullable().default(null),
          })
          .default({ countries: null, currencies: null }),
        fields: z.array(
          z.object({
            key: z.string().regex(/^[a-z0-9_-]{1,80}$/),
            label: z.string().trim().min(1).max(120),
            value: z.string().trim().min(1).max(2000),
          }),
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
  for (const account of config.config.accounts) {
    if (ids.has(account.id)) throw new Error(`${path} account IDs must be unique`);
    ids.add(account.id);
    for (const code of account.filters.countries ?? [])
      if (!/^[A-Z]{2}$/.test(code))
        throw new Error(
          `${path} account ${account.id} countries must use uppercase ISO alpha-2 codes`,
        );
    for (const code of account.filters.currencies ?? [])
      if (!/^[A-Z]{3}$/.test(code))
        throw new Error(
          `${path} account ${account.id} currencies must use uppercase ISO alpha-3 codes`,
        );
  }
  const accounts: BankTransferAccount[] = config.config.accounts.map((account) => ({
    id: account.id,
    fields: account.fields,
    filters: account.filters,
  }));
  const provider: BankTransferConfiguration = {
    accounts,
    displayName: config.display_name,
    imageUrl: config.image_url,
    description: config.description,
  };
  return {
    provider,
    filters: { countries: null, currencies: null } satisfies PaymentProviderFilters,
  };
}
