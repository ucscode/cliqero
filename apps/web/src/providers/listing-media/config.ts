import { z } from "zod";
import { parseYamlConfiguration, resolveEnvironmentPlaceholders } from "@/config/yaml";
import { ObjectStorageRegistry } from "@/modules/listing-media/storage";
import { FilesystemObjectStorageProvider } from "@/providers/filesystem/storage/provider";
import { SupabaseObjectStorageProvider } from "@/providers/supabase/storage/provider";
import { CloudflareR2ObjectStorageProvider } from "@/providers/cloudflare-r2/storage/provider";
const schema = z.object({
  default_provider: z.enum(["filesystem", "supabase", "cloudflare-r2"]),
  providers: z.object({
    filesystem: z
      .object({ enabled: z.boolean(), root: z.string().min(1), public_base_url: z.url() })
      .optional(),
    supabase: z
      .object({
        enabled: z.boolean(),
        endpoint: z.url(),
        bucket: z.string().min(1),
        service_key: z.string().min(1),
      })
      .optional(),
    "cloudflare-r2": z
      .object({
        enabled: z.boolean(),
        endpoint: z.url(),
        bucket: z.string().min(1),
        public_base_url: z.url(),
        access_key_id: z.string().min(1),
        secret_access_key: z.string().min(1),
      })
      .optional(),
  }),
});
export function loadListingMediaStorage() {
  const path = "config/modules/storage/listing-media.yaml";
  const raw = parseYamlConfiguration(path);
  const publicOrigin = process.env.APP_URL ?? "http://localhost:3000";
  const config =
    raw === null
      ? {
          default_provider: "filesystem" as const,
          providers: {
            filesystem: {
              enabled: true,
              root: "/var/lib/cliqero/listing-media",
              public_base_url: `${publicOrigin.replace(/\/$/, "")}/media/filesystem`,
            },
          },
        }
      : schema.parse(resolveEnvironmentPlaceholders(raw, process.env, path));
  const registry = new ObjectStorageRegistry(config.default_provider);
  const filesystem = config.providers.filesystem;
  if (filesystem?.enabled)
    registry.register(
      new FilesystemObjectStorageProvider(filesystem.root, filesystem.public_base_url),
    );
  const supabase = config.providers.supabase;
  if (supabase?.enabled)
    registry.register(
      new SupabaseObjectStorageProvider(supabase.endpoint, supabase.bucket, supabase.service_key),
    );
  const r2 = config.providers["cloudflare-r2"];
  if (r2?.enabled)
    registry.register(
      new CloudflareR2ObjectStorageProvider(
        r2.endpoint,
        r2.bucket,
        r2.public_base_url,
        r2.access_key_id,
        r2.secret_access_key,
      ),
    );
  registry.default();
  return registry;
}
