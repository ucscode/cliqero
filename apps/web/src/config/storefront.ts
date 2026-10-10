import { z } from "zod";
import { loadYamlConfiguration } from "./yaml";

const schema = z
  .object({
    home: z.object({ featured_limit: z.number().int().min(1).max(24) }).strict(),
    catalogue: z.object({ page_size: z.number().int().min(1).max(48) }).strict(),
    reviews: z
      .object({ visible: z.boolean(), page_size: z.number().int().min(1).max(50) })
      .strict(),
  })
  .strict();

export function loadStorefrontConfiguration(path = "config/storefront.yaml") {
  return schema.parse(loadYamlConfiguration(path, process.env, { required: true }));
}
