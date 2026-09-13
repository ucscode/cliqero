import { z } from "zod";
import { loadYamlConfiguration } from "@/config/yaml";
import {
  ObjectStorageRegistry,
  type ObjectStorageProvider,
} from "@/modules/storage/object-storage";
import { FilesystemObjectStorageProvider } from "@/providers/filesystem/storage/provider";
import { SupabaseObjectStorageProvider } from "@/providers/supabase/storage/provider";
import { CloudflareR2ObjectStorageProvider } from "@/providers/cloudflare-r2/storage/provider";

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

const schema = z
  .object({
    default_provider: instanceName,
    providers: z.record(instanceName, storageConfig),
  })
  .strict()
  .superRefine((config, context) => {
    const defaultProvider = config.providers[config.default_provider];
    if (!defaultProvider)
      context.addIssue({
        code: "custom",
        path: ["default_provider"],
        message: "default_provider must reference a configured storage instance",
      });
    for (const [name, provider] of Object.entries(config.providers)) {
      if (provider.visibility === "public") {
        const hasPublicUrl =
          provider.provider === "supabase" || Boolean(provider.config.public_base_url);
        if (!hasPublicUrl)
          context.addIssue({
            code: "custom",
            path: ["providers", name, "config", "public_base_url"],
            message: "Public storage instances must define public_base_url",
          });
      }
    }
  });

export function loadMediaStorage(
  path = "config/storage/media.yaml",
  environment: Record<string, string | undefined> = {
    ...process.env,
    MEDIA_ROOT:
      process.env.MEDIA_ROOT ??
      (process.env.NODE_ENV === "test" ? "/tmp/cliqero-media" : "/var/lib/cliqero/media"),
  },
) {
  const config = schema.parse(loadYamlConfiguration(path, environment, { required: true }));
  const registry = new ObjectStorageRegistry(config.default_provider);
  for (const [name, instance] of Object.entries(config.providers))
    registry.register(name, createProvider(name, instance));
  registry.default();
  return registry;
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

export function requirePublicStorage(registry: ObjectStorageRegistry, name?: string) {
  const provider = name ? registry.get(name) : registry.default();
  if (provider.visibility === "private")
    throw new Error(`Storage instance must be public: ${name ?? provider.name}`);
  if (!provider.publicUrl)
    throw new Error(`Storage instance cannot produce public URLs: ${name ?? provider.name}`);
  return provider;
}

export function requirePrivateStorage(registry: ObjectStorageRegistry, name: string) {
  const provider = registry.get(name);
  if (provider.visibility !== "private")
    throw new Error(`Storage instance must be private: ${name}`);
  return provider;
}
