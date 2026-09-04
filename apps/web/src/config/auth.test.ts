import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getEnabledSocialProviders, loadAuthConfiguration } from "./auth";

const files: string[] = [];
afterEach(() => {
  for (const file of files.splice(0)) fs.rmSync(file, { force: true });
});

function configuration(contents: string) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cliqero-auth-")), "auth.yaml");
  fs.writeFileSync(file, contents);
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
  });

  it("omits disabled providers", () => {
    expect(
      getEnabledSocialProviders(configuration("social:\n  google:\n    enabled: false\n")),
    ).toEqual({});
  });

  it("rejects incomplete enabled provider credentials", () => {
    const file = configuration("social:\n  google:\n    enabled: true\n    client_id: client\n");
    expect(() => loadAuthConfiguration(file)).toThrow("requires client_id and client_secret");
  });
});
