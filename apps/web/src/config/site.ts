import {
  loadSiteConfiguration,
  siteConfigurationSchema,
  toPublicSiteConfiguration,
} from "./site-loader";

const publicConfiguration = (() => {
  try {
    return siteConfigurationSchema.parse(JSON.parse(process.env.NEXT_PUBLIC_SITE_CONFIG ?? ""));
  } catch {
    return null;
  }
})();
export { loadSiteConfiguration } from "./site-loader";

function readPublicConfiguration() {
  if (publicConfiguration) return publicConfiguration;
  if (typeof window === "undefined") return toPublicSiteConfiguration(loadSiteConfiguration());
  throw new Error("NEXT_PUBLIC_SITE_CONFIG is missing; site identity was not configured");
}

const configuration = readPublicConfiguration();

export const siteConfig = {
  name: configuration.name,
  url: configuration.url,
  supportEmail: configuration.support_email,
  description: configuration.description,
} as const;
