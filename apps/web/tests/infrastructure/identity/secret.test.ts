import { describe, expect, it } from "vitest";
import { resolveBetterAuthSecret } from "@/infrastructure/identity/secret";

describe("Better Auth secret configuration", () => {
  it("keeps the development fallback outside production", () => {
    expect(resolveBetterAuthSecret({ NODE_ENV: "development" })).toBe(
      "cliqero-development-better-auth-secret-change-me-32",
    );
  });

  it.each([
    undefined,
    "",
    "  ",
    "development",
    "secret",
    "changeme",
    "replace-with-a-random-secret-at-least-32-characters",
    "cliqero-development-better-auth-secret-change-me-32",
    "short",
  ])("rejects missing, weak, or placeholder production secrets (%s)", (secret) => {
    expect(() =>
      resolveBetterAuthSecret({ NODE_ENV: "production", BETTER_AUTH_SECRET: secret }),
    ).toThrow(/unique random value of at least 32 characters/);
  });

  it("accepts an explicitly supplied strong production secret without changing it", () => {
    const secret = "a-unique-production-secret-that-is-at-least-32-characters-long";
    expect(resolveBetterAuthSecret({ NODE_ENV: "production", BETTER_AUTH_SECRET: secret })).toBe(
      secret,
    );
  });
});
