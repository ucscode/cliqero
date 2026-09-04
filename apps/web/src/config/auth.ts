import { z } from "zod";
import { loadYamlConfiguration } from "./yaml";

const publicConfiguration = (() => {
  try {
    return JSON.parse(process.env.NEXT_PUBLIC_AUTH_CONFIG ?? "{}") as {
      google?: { enabled?: boolean };
    };
  } catch {
    return {};
  }
})();

const providerSchema = z.object({
  enabled: z.boolean().default(false),
  client_id: z.string().default(""),
  client_secret: z.string().default(""),
});

const schema = z.object({
  social: z
    .object({
      google: providerSchema.default({ enabled: false, client_id: "", client_secret: "" }),
    })
    .default({ google: { enabled: false, client_id: "", client_secret: "" } }),
});

export type AuthConfiguration = z.infer<typeof schema>;

export function loadAuthConfiguration(path = "config/security/auth.yaml"): AuthConfiguration {
  if (path === "config/security/auth.yaml" && typeof window !== "undefined") {
    return schema.parse({
      social: {
        google: {
          enabled: Boolean(publicConfiguration.google?.enabled),
          client_id: "",
          client_secret: "",
        },
      },
    });
  }
  const configuration = schema.parse(loadYamlConfiguration(path) ?? {});
  const google = configuration.social.google;
  if (google.enabled && (!google.client_id.trim() || !google.client_secret.trim())) {
    throw new Error("Enabled Google authentication requires client_id and client_secret");
  }
  return configuration;
}

export function getEnabledSocialProviders(path?: string) {
  const configuration = loadAuthConfiguration(path);
  const google = configuration.social.google;
  if (!google.enabled) return {} as const;
  return {
    google: { clientId: google.client_id.trim(), clientSecret: google.client_secret.trim() },
  };
}

export function hasGoogleAuthentication(path?: string): boolean {
  return Boolean(getEnabledSocialProviders(path).google);
}
