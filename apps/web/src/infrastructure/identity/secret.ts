const developmentSecret = "cliqero-development-better-auth-secret-change-me-32";
const knownPlaceholders = new Set([
  developmentSecret,
  "development",
  "secret",
  "changeme",
  "replace-with-a-random-secret-at-least-32-characters",
]);

export function resolveBetterAuthSecret(environment: NodeJS.ProcessEnv = process.env): string {
  const secret = environment.BETTER_AUTH_SECRET?.trim();
  if (environment.NODE_ENV !== "production") return secret || developmentSecret;

  if (!secret || secret.length < 32 || knownPlaceholders.has(secret.toLowerCase()))
    throw new Error(
      "Production requires BETTER_AUTH_SECRET to be a unique random value of at least 32 characters.",
    );
  return secret;
}
