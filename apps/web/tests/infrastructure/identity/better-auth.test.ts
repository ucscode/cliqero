import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import { BetterAuthBoundary } from "@/infrastructure/identity/better-auth";
import { configurationEnvelope } from "../../config/yaml-fixture";

const directories: string[] = [];
const database = {
  query: async () => ({ rows: [], rowCount: 0 }),
} satisfies QueryExecutor;

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

describe("Better Auth optional social providers", () => {
  it("keeps core email/password auth when Google configuration is invalid", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cliqero-auth-boundary-"));
    directories.push(directory);
    const config = join(directory, "auth.yaml");
    await writeFile(
      config,
      configurationEnvelope("social:\n  google:\n    enabled: true\n    client_id: client\n"),
    );

    const boundary = new BetterAuthBoundary(
      database,
      "postgresql://localhost/cliqero-test",
      config,
    );

    expect(boundary.auth.options.emailAndPassword?.enabled).toBe(true);
    expect(boundary.auth.options.user?.changeEmail).toEqual({
      enabled: true,
      updateEmailWithoutVerification: false,
    });
    expect(boundary.auth.options.emailVerification?.sendVerificationEmail).toBeTypeOf("function");
    expect(boundary.auth.options.emailVerification?.sendOnSignUp).toBe(true);
    expect(boundary.auth.options.socialProviders).toEqual({});
    expect(boundary.auth.options.account?.accountLinking).toMatchObject({
      enabled: true,
      trustedProviders: [],
      requireLocalEmailVerified: true,
      allowDifferentEmails: false,
    });

    await boundary.close();
  });
});
