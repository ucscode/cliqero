import { z } from "zod";
import { parseYamlConfiguration, resolveEnvironmentPlaceholders } from "@/config/yaml";
import type { DirectTrc20Configuration } from "./provider";
import {
  parsePaymentProviderFilters,
  paymentProviderFiltersSchema,
} from "@/modules/payment/provider-configuration";
const schema = z.object({
  enabled: z.boolean().default(false),
  display_name: z.string().trim().min(1),
  image_url: z.string().trim().min(1),
  description: z.string().trim().min(1),
  config: z.object({
    wallet_address: z.string().trim().min(1),
    confirmations_required: z.number().int().positive().default(12),
    max_transaction_age_seconds: z.number().int().positive().default(86_400),
    token_contract: z.string().trim().min(1),
    verification: z.object({
      provider: z.literal("trongrid"),
      api_key: z.string().min(1).optional(),
      api_base_url: z.url(),
    }),
  }),
  filters: paymentProviderFiltersSchema.default({ countries: null }),
});
export function loadDirectTrc20Configuration(path: string) {
  const value = parseYamlConfiguration(path);
  if (value === null) return null;
  const parsed = schema.parse(resolveEnvironmentPlaceholders(value, process.env, path));
  if (!parsed.enabled) return null;
  const filters = parsePaymentProviderFilters(parsed.filters, path);
  return {
    provider: {
      displayName: parsed.display_name,
      imageUrl: parsed.image_url,
      description: parsed.description,
      walletAddress: parsed.config.wallet_address,
      confirmationsRequired: parsed.config.confirmations_required,
      maxTransactionAgeSeconds: parsed.config.max_transaction_age_seconds,
      tokenContract: parsed.config.token_contract,
      verification: {
        provider: parsed.config.verification.provider,
        apiKey: parsed.config.verification.api_key,
        apiBaseUrl: parsed.config.verification.api_base_url,
      },
    } satisfies DirectTrc20Configuration,
    filters,
  };
}
