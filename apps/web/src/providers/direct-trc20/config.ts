import { z } from "zod";
import { parseYamlConfiguration, resolveEnvironmentPlaceholders } from "@/config/yaml";
import type { PaymentProviderFilters } from "@/modules/payment/payment";
import type { DirectTrc20Configuration } from "./provider";

const filters = z.object({
  countries: z.array(z.string()).nullable().default(null),
  currencies: z.array(z.string()).nullable().default(null),
});
const schema = z.object({
  enabled: z.boolean().default(false),
  display_name: z.string().trim().min(1),
  image_url: z.string().trim().min(1),
  description: z.string().trim().min(1),
  config: z.object({
    wallet_address: z.string().min(1),
    confirmations_required: z.number().int().positive().default(12),
    token_contract: z.string().min(1),
    verification: z.object({
      provider: z.literal("trongrid"),
      api_key: z.string().min(1).optional(),
      api_base_url: z.url(),
    }),
  }),
  filters: filters.default({ countries: null, currencies: ["USD"] }),
});
export function loadDirectTrc20Configuration(path: string) {
  const value = parseYamlConfiguration(path);
  if (value === null) return null;
  const parsed = schema.parse(resolveEnvironmentPlaceholders(value, process.env, path));
  if (!parsed.enabled) return null;
  validateFilters(parsed.filters, path);
  return {
    provider: {
      displayName: parsed.display_name,
      imageUrl: parsed.image_url,
      description: parsed.description,
      walletAddress: parsed.config.wallet_address,
      confirmationsRequired: parsed.config.confirmations_required,
      tokenContract: parsed.config.token_contract,
      verification: {
        provider: parsed.config.verification.provider,
        apiKey: parsed.config.verification.api_key,
        apiBaseUrl: parsed.config.verification.api_base_url,
      },
    } satisfies DirectTrc20Configuration,
    filters: parsed.filters as PaymentProviderFilters,
  };
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
