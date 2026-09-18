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

export type EnabledSocialProviders = {
  google?: { clientId: string; clientSecret: string };
};

export class AuthProviderConfigurationError extends Error {
  constructor(
    readonly provider: "google",
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AuthProviderConfigurationError";
  }
}

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
    throw new AuthProviderConfigurationError(
      "google",
      "Google authentication configuration is invalid: Enabled Google authentication requires client_id and client_secret",
    );
  }
  return configuration;
}

export function getEnabledSocialProviders(path?: string): EnabledSocialProviders {
  const configuration = loadAuthConfiguration(path);
  const google = configuration.social.google;
  if (!google.enabled) return {} as const;
  return {
    google: { clientId: google.client_id.trim(), clientSecret: google.client_secret.trim() },
  };
}

export function getOptionalSocialProviders(
  path?: string,
  onFailure?: (error: AuthProviderConfigurationError) => void,
): EnabledSocialProviders {
  try {
    return getEnabledSocialProviders(path);
  } catch (error) {
    const configurationError =
      error instanceof AuthProviderConfigurationError
        ? error
        : new AuthProviderConfigurationError(
            "google",
            `Google authentication configuration is invalid: ${error instanceof Error ? error.message : String(error)}`,
            error,
          );
    onFailure?.(configurationError);
    return {};
  }
}

export function hasGoogleAuthentication(path?: string): boolean {
  return Boolean(getOptionalSocialProviders(path).google);
}
