import { z } from "zod";
import { loadYamlConfiguration } from "./yaml";
import type {
  ObjectStorageRegistry,
  ObjectStorageProvider,
} from "@/modules/storage/object-storage";

const schema = z.object({
  media_provider: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
    .optional(),
  home: z.object({ featured_limit: z.number().int().min(1).max(24) }),
  catalogue: z.object({ page_size: z.number().int().min(1).max(48) }),
  reviews: z.object({ visible: z.boolean(), page_size: z.number().int().min(1).max(50) }),
});

export function loadStorefrontConfiguration(path = "config/storefront.yaml") {
  return schema.parse(loadYamlConfiguration(path, process.env, { required: true }));
}

export function resolveStorefrontMediaProvider(
  config: ReturnType<typeof loadStorefrontConfiguration>,
  storage: ObjectStorageRegistry,
): ObjectStorageProvider {
  return config.media_provider ? storage.get(config.media_provider) : storage.default();
}
