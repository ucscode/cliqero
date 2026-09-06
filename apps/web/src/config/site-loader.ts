import { z } from "zod";
import { loadYamlConfiguration } from "./yaml";

export const siteConfigurationSchema = z.object({
  name: z.string().trim().min(1),
  url: z.string().url(),
  support_email: z.string().email(),
  description: z.string().trim().min(1),
});

export type SiteConfiguration = z.infer<typeof siteConfigurationSchema>;

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
    name: configuration.name,
    url: configuration.url,
    support_email: configuration.support_email,
    description: configuration.description,
  } as const;
}
