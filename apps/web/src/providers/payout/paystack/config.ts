import { z } from "zod";
import type { PaystackPayoutConfiguration } from "./provider";
import { parseYamlConfiguration, resolveEnvironmentPlaceholders } from "@/config/yaml";
const rawSchema = z.object({
  enabled: z.boolean().default(false),
  config: z.record(z.string(), z.unknown()).default({}),
});
const configSchema = z.object({
  enabled: z.boolean(),
  config: z.object({ secret_key: z.string().min(1) }),
});
export function loadPaystackPayoutConfiguration(): PaystackPayoutConfiguration | null {
  const path = "config/modules/payout/paystack.yaml";
  const raw = parseYamlConfiguration(path);
  if (raw === null) return null;
  const enabledConfig = rawSchema.parse(raw);
  if (!enabledConfig.enabled) return null;
  const config = configSchema.parse(resolveEnvironmentPlaceholders(raw, process.env, path));
  return {
    secretKey: config.config.secret_key,
    apiBaseUrl: "https://api.paystack.co",
    enabled: true,
  };
}
