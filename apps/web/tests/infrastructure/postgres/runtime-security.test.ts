import { describe, expect, it } from "vitest";
import {
  assertProductionDatabaseUrl,
  verifyProductionDatabaseRole,
} from "@/infrastructure/postgres/runtime-security";

const secureEnvironment = {
  NODE_ENV: "production",
  POSTGRES_USER: "schema_owner",
  DATABASE_URL: `postgresql://runtime_user:${"a".repeat(40)}@postgres:5432/cliqero`,
} as NodeJS.ProcessEnv;

describe("production PostgreSQL runtime configuration", () => {
  it("allows restricted runtime credentials distinct from the bootstrap role", () => {
    expect(() => assertProductionDatabaseUrl(secureEnvironment)).not.toThrow();
  });

  it.each([
    { ...secureEnvironment, DATABASE_URL: "" },
    { ...secureEnvironment, POSTGRES_USER: "" },
    {
      ...secureEnvironment,
      DATABASE_URL:
        "postgresql://schema_owner:secure-password-12345678901234567890@postgres/cliqero",
    },
    {
      ...secureEnvironment,
      DATABASE_URL: "postgresql://postgres:secure-password-12345678901234567890@postgres/cliqero",
    },
    {
      ...secureEnvironment,
      DATABASE_URL: "postgresql://runtime_user:cliqero-runtime-local@postgres/cliqero",
    },
    { ...secureEnvironment, DATABASE_URL: "postgresql://runtime_user:short@postgres/cliqero" },
  ])("rejects missing, bootstrap, or insecure production database credentials", (environment) => {
    expect(() => assertProductionDatabaseUrl(environment)).toThrow(/Production/);
  });

  it("does not enforce production-only role checks during development", async () => {
    await expect(
      verifyProductionDatabaseRole({ NODE_ENV: "development" }),
    ).resolves.toBeUndefined();
  });
});
