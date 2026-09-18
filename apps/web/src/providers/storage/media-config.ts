import { z } from "zod";
import { parseYamlConfiguration, resolveEnvironmentPlaceholders } from "@/config/yaml";
import {
  ObjectStorageRegistry,
  StorageConfigurationError,
  type ObjectStorageProvider,
} from "@/modules/storage/object-storage";
import { FilesystemObjectStorageProvider } from "@/providers/storage/filesystem/provider";
import { SupabaseObjectStorageProvider } from "@/providers/storage/supabase/provider";
import { CloudflareR2ObjectStorageProvider } from "@/providers/storage/cloudflare-r2/provider";

const instanceName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const visibility = z.enum(["public", "private"]);
const storageConfig = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("filesystem"),
    visibility,
    config: z
      .object({
        root: z.string().min(1),
        container: z.string().min(1).optional(),
        public_base_url: z.url().optional(),
      })
      .strict(),
  }),
  z.object({
    provider: z.literal("supabase"),
    visibility,
    config: z
      .object({
        endpoint: z.url(),
        bucket: z.string().min(1),
        service_key: z.string().min(1),
      })
      .strict(),
  }),
  z.object({
    provider: z.literal("cloudflare-r2"),
    visibility,
    config: z
      .object({
        endpoint: z.url(),
        bucket: z.string().min(1),
        public_base_url: z.url().optional(),
        access_key_id: z.string().min(1),
        secret_access_key: z.string().min(1),
      })
      .strict(),
  }),
]);

const rootSchema = z
  .object({
    default_provider: instanceName,
    providers: z.record(instanceName, z.unknown()),
  })
  .strict();

export function loadMediaStorage(
  path = "config/storage/media.yaml",
  environment: Record<string, string | undefined> = {
    ...process.env,
    MEDIA_ROOT:
      process.env.MEDIA_ROOT ??
      (process.env.NODE_ENV === "test" ? "/tmp/cliqero-media" : "/var/lib/cliqero/media"),
  },
  options: { onFailure?: (error: StorageConfigurationError) => void } = {},
) {
  const raw = parseYamlConfiguration(path);
  if (raw === null) throw new Error(`Required configuration file is missing: ${path}`);
  const config = rootSchema.parse(raw);
  if (!(config.default_provider in config.providers))
    throw new Error("default_provider must reference a configured storage instance");
  const registry = new ObjectStorageRegistry(config.default_provider);
  for (const [name, instance] of Object.entries(config.providers))
    registry.registerLazy(
      name,
      () => createProvider(name, loadStorageProviderConfig(name, instance, environment, path)),
      options,
    );
  return registry;
}

function loadStorageProviderConfig(
  name: string,
  value: unknown,
  environment: Record<string, string | undefined>,
  path: string,
): z.infer<typeof storageConfig> {
  try {
    return parseStorageConfig(
      resolveEnvironmentPlaceholders(value, environment, `${path}.providers.${name}`),
    );
  } catch (error) {
    if (error instanceof StorageConfigurationError) throw error;
    throw new StorageConfigurationError(
      name,
      `Storage configuration is invalid: ${name}: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}

function parseStorageConfig(value: unknown): z.infer<typeof storageConfig> {
  return storageConfig.parse(value);
}

function createProvider(
  name: string,
  instance: z.infer<typeof storageConfig>,
): ObjectStorageProvider {
  if (instance.provider === "filesystem")
    return new FilesystemObjectStorageProvider(
      name,
      instance.config.root,
      instance.config.public_base_url,
      instance.config.container ?? name,
      instance.visibility,
    );
  if (instance.provider === "supabase")
    return new SupabaseObjectStorageProvider(
      name,
      instance.config.endpoint,
      instance.config.bucket,
      instance.config.service_key,
      instance.visibility,
    );
  return new CloudflareR2ObjectStorageProvider(
    name,
    instance.config.endpoint,
    instance.config.bucket,
    instance.config.public_base_url,
    instance.config.access_key_id,
    instance.config.secret_access_key,
    instance.visibility,
  );
}
