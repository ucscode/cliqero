import { z } from "zod";
import { loadYamlConfiguration } from "./yaml";

const schema = z.object({
  home: z.object({ featured_limit: z.number().int().min(1).max(24) }),
  catalogue: z.object({ page_size: z.number().int().min(1).max(48) }),
  reviews: z.object({ visible: z.boolean(), page_size: z.number().int().min(1).max(50) }),
});

export function loadStorefrontConfiguration(path = "config/storefront.yaml") {
  return schema.parse(loadYamlConfiguration(path, process.env, { required: true }));
}

export const storefrontConfig = loadStorefrontConfiguration();
