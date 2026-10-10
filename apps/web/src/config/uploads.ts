import { z } from "zod";
import { loadYamlConfiguration } from "./yaml";
import type {
  ObjectStorageProvider,
  ObjectStorageRegistry,
} from "@/modules/storage/object-storage";

const instanceName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const schema = z
  .object({
    catalogue: z.object({ media_provider: instanceName.optional() }).strict().default({}),
    blog: z.object({ media_provider: instanceName.optional() }).strict().default({}),
  })
  .strict();

export type UploadsConfiguration = z.infer<typeof schema>;

export function loadUploadsConfiguration(path = "config/storage/uploads.yaml") {
  return schema.parse(loadYamlConfiguration(path, process.env, { required: true }));
}

export function resolveCatalogueMediaProvider(
  config: UploadsConfiguration,
  storage: ObjectStorageRegistry,
): ObjectStorageProvider {
  return resolveMediaProvider(config.catalogue.media_provider, "catalogue", storage);
}

export function resolveBlogMediaProvider(
  config: UploadsConfiguration,
  storage: ObjectStorageRegistry,
): ObjectStorageProvider {
  return resolveMediaProvider(config.blog.media_provider, "blog", storage);
}

function resolveMediaProvider(
  instanceName: string | undefined,
  owner: "catalogue" | "blog",
  storage: ObjectStorageRegistry,
): ObjectStorageProvider {
  if (!instanceName) return storage.default();
  if (!storage.names().includes(instanceName))
    throw new Error(
      `Invalid uploads configuration: ${owner}.media_provider "${instanceName}" is not configured in config/storage/media.yaml`,
    );
  return storage.get(instanceName);
}
