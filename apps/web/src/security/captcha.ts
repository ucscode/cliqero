import { z } from "zod";
import { loadYamlConfiguration } from "@/config/yaml";

export type CaptchaProvider = "turnstile" | "hcaptcha" | "recaptcha";

const defaultConfiguration = {
  enabled: false,
  provider: "turnstile" as CaptchaProvider,
  site_key: "",
  secret_key: "",
};
const configurationSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(["turnstile", "hcaptcha", "recaptcha"]).default("turnstile"),
  site_key: z.string().default(""),
  secret_key: z.string().default(""),
});

export function loadCaptchaConfiguration(path = "config/security/captcha.yaml") {
  const raw = loadYamlConfiguration(path);
  return raw === null ? defaultConfiguration : configurationSchema.parse(raw);
}

export function getCaptchaPublicConfiguration(path?: string) {
  const configuration = loadCaptchaConfiguration(path);
  return {
    enabled: configuration.enabled,
    provider: configuration.provider,
    siteKey: configuration.site_key,
  } as const;
}

export async function verifyCaptchaToken(
  token: unknown,
  remoteIp?: string | null,
  required = false,
  path?: string,
): Promise<boolean> {
  const configuration = loadCaptchaConfiguration(path);
  if (!required || !configuration.enabled) return true;
  if (typeof token !== "string" || !token || !configuration.secret_key) return false;
  const endpoint =
    configuration.provider === "hcaptcha"
      ? "https://hcaptcha.com/siteverify"
      : configuration.provider === "recaptcha"
        ? "https://www.google.com/recaptcha/api/siteverify"
        : "https://challenges.cloudflare.com/turnstile/v0/siteverify";
  const body = new URLSearchParams({ secret: configuration.secret_key, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const result = (await response.json()) as { success?: boolean };
    return response.ok && result.success === true;
  } catch {
    return false;
  }
}
