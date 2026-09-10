import { z } from "zod";
import { parseYamlConfiguration, resolveEnvironmentPlaceholders } from "@/config/yaml";
import type { PaymentProviderFilters } from "@/modules/payment/payment";
import type { BankTransferConfiguration } from "./provider";

const schema = z.object({
  enabled: z.boolean().default(false),
  config: z.object({
    bank_name: z.string().min(1),
    account_name: z.string().min(1),
    account_number: z.string().min(1),
    instructions: z.string().optional(),
  }),
  filters: z
    .object({
      countries: z.array(z.string()).nullable().default(null),
      currencies: z.array(z.string()).nullable().default(null),
    })
    .default({ countries: null, currencies: null }),
});

export function loadBankTransferConfiguration(path = "config/modules/payment/bank_transfer.yaml") {
  const value = parseYamlConfiguration(path);
  if (value === null) return null;
  const config = schema.parse(resolveEnvironmentPlaceholders(value, process.env, path));
  if (!config.enabled) return null;
  for (const code of config.filters.countries ?? [])
    if (!/^[A-Z]{2}$/.test(code))
      throw new Error(`${path} countries must use uppercase ISO alpha-2 codes`);
  for (const code of config.filters.currencies ?? [])
    if (!/^[A-Z]{3}$/.test(code))
      throw new Error(`${path} currencies must use uppercase ISO alpha-3 codes`);
  const provider: BankTransferConfiguration = {
    bankName: config.config.bank_name,
    accountName: config.config.account_name,
    accountNumber: config.config.account_number,
    instructions: config.config.instructions,
  };
  return { provider, filters: config.filters as PaymentProviderFilters };
}
