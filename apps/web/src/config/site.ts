import { z } from "zod";
import { loadYamlConfiguration } from "./yaml";

const publicConfiguration = (() => {
  try {
    return JSON.parse(process.env.NEXT_PUBLIC_SITE_CONFIG ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
})();

const defaults = {
  name: publicConfiguration.name || "Cliqero",
  url: publicConfiguration.url || process.env.APP_URL?.trim() || "http://localhost:3000",
  support_email: publicConfiguration.support_email || "support@cliqero.com",
  description:
    publicConfiguration.description || "Catalogue commerce, wallet access and referrals.",
};

const schema = z.object({
  name: z.string().trim().min(1),
  url: z.string().url(),
  support_email: z.string().email(),
  description: z.string().trim().min(1),
});

export function loadSiteConfiguration(path = "config/site.yaml") {
  const loaded = loadYamlConfiguration(path, {
    ...process.env,
    APP_URL: process.env.APP_URL?.trim() || "http://localhost:3000",
  });
  return schema.parse(loaded ?? defaults);
}

const configuration = loadSiteConfiguration();

export const siteConfig = {
  name: configuration.name,
  url: configuration.url,
  supportEmail: configuration.support_email,
  description: configuration.description,
} as const;
