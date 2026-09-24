import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getEnabledSocialProviders,
  getOptionalSocialProviders,
  getOptionalSocialProvidersFrom,
  hasGoogleAuthentication,
  loadAuthConfiguration,
} from "@/config/auth";
import { configurationEnvelope } from "./yaml-fixture";

const files: string[] = [];
afterEach(() => {
  for (const file of files.splice(0)) fs.rmSync(file, { force: true });
});

function configuration(contents: string) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cliqero-auth-")), "auth.yaml");
  fs.writeFileSync(file, configurationEnvelope(contents));
  files.push(file);
  return file;
}

describe("YAML Better Auth providers", () => {
  it("passes enabled Google credentials to Better Auth", () => {
    const file = configuration(
      "social:\n  google:\n    enabled: true\n    client_id: client\n    client_secret: secret\n",
    );
    expect(getEnabledSocialProviders(file)).toEqual({
      google: { clientId: "client", clientSecret: "secret" },
    });
    expect(hasGoogleAuthentication(file)).toBe(true);
  });

  it("omits disabled providers", () => {
    const file = configuration("social:\n  google:\n    enabled: false\n");
    expect(getEnabledSocialProviders(file)).toEqual({});
    expect(hasGoogleAuthentication(file)).toBe(false);
  });

  it("rejects incomplete enabled provider credentials", () => {
    const file = configuration("social:\n  google:\n    enabled: true\n    client_id: client\n");
    expect(() => loadAuthConfiguration(file)).toThrow("requires client_id and client_secret");
  });

  it.each([
    ["missing client_id", "social:\n  google:\n    enabled: true\n    client_secret: secret\n"],
    ["missing client_secret", "social:\n  google:\n    enabled: true\n    client_id: client\n"],
  ])("reports %s as a typed optional-provider configuration failure", (_label, contents) => {
    const file = configuration(contents);
    const failures: Error[] = [];

    expect(getOptionalSocialProviders(file, (error) => failures.push(error))).toEqual({});
    expect(failures[0]).toBeInstanceOf(Error);
    expect(failures[0].name).toBe("AuthProviderConfigurationError");
  });

  it("reports malformed YAML and schema values as typed configuration failures", () => {
    const malformedYaml = configuration("social: [\n");
    const malformedSchema = configuration("social:\n  google: enabled\n");

    expect(() => getOptionalSocialProviders(malformedYaml)).not.toThrow();
    expect(() => getOptionalSocialProviders(malformedSchema)).not.toThrow();
  });

  it("reports missing auth environment values as typed configuration failures", () => {
    const file = configuration(
      'social:\n  google:\n    enabled: true\n    client_id: "%env(MISSING_AUTH_CLIENT_ID)%"\n    client_secret: secret\n',
    );
    const failures: Error[] = [];

    expect(getOptionalSocialProviders(file, (error) => failures.push(error))).toEqual({});
    expect(failures[0].name).toBe("AuthProviderConfigurationError");
  });

  it("keeps invalid Google optional while reporting a typed configuration failure", () => {
    const file = configuration("social:\n  google:\n    enabled: true\n    client_id: client\n");
    const failures: Error[] = [];

    expect(getOptionalSocialProviders(file, (error) => failures.push(error))).toEqual({});
    expect(hasGoogleAuthentication(file)).toBe(false);
    expect(failures).toHaveLength(1);
    expect(failures[0].name).toBe("AuthProviderConfigurationError");
    expect(failures[0].message).toContain("Google authentication configuration");
  });

  it("does not hide unexpected programming errors", () => {
    const failure = new TypeError("unexpected auth invariant");

    expect(() =>
      getOptionalSocialProvidersFrom(() => {
        throw failure;
      }),
    ).toThrow(failure);
  });
});
