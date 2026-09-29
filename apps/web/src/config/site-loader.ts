import { z } from "zod";
import { loadYamlConfiguration } from "./yaml";

export const siteConfigurationSchema = z
  .object({
    site: z
      .object({
        name: z.string().trim().min(1),
        url: z.string().url(),
        support_email: z.string().email(),
        description: z.string().trim().min(1),
      })
      .strict(),
    crud: z
      .object({
        table: z.object({ max_rows: z.number().int().positive().max(200) }).strict(),
      })
      .strict(),
  })
  .strict();

export type SiteConfiguration = z.infer<typeof siteConfigurationSchema>;
export const publicSiteConfigurationSchema = siteConfigurationSchema.shape.site;
export type PublicSiteConfiguration = z.infer<typeof publicSiteConfigurationSchema>;

/** Load the deployment-owned site configuration from YAML. */
export function loadSiteConfiguration(path = "config/site.yaml"): SiteConfiguration {
  const environment =
    process.env.NODE_ENV === "production"
      ? process.env
      : { ...process.env, APP_URL: process.env.APP_URL ?? "http://localhost:3000" };
  return siteConfigurationSchema.parse(
    loadYamlConfiguration(path, environment, { required: true }),
  );
}

export function toPublicSiteConfiguration(configuration: SiteConfiguration) {
  return {
    name: configuration.site.name,
    url: configuration.site.url,
    support_email: configuration.site.support_email,
    description: configuration.site.description,
  } as const;
}
