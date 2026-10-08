import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const entrypoint = resolve(process.cwd(), "../../database/roles/postgres-entrypoint.sh");
const secureEnvironment = {
  CLIQERO_DEPLOYMENT_MODE: "production",
  POSTGRES_DB: "cliqero_prod",
  POSTGRES_USER: "schema_owner",
  POSTGRES_PASSWORD: "b".repeat(40),
  POSTGRES_APP_USER: "runtime_app",
  POSTGRES_APP_PASSWORD: "a".repeat(40),
};

describe("PostgreSQL production entrypoint guard", () => {
  it("rejects missing credentials before invoking the PostgreSQL entrypoint", () => {
    const result = spawnSync("bash", [entrypoint, "postgres"], {
      env: {
        ...process.env,
        CLIQERO_DEPLOYMENT_MODE: "production",
        POSTGRES_DB: "",
        POSTGRES_USER: "",
        POSTGRES_PASSWORD: "",
        POSTGRES_APP_USER: "",
        POSTGRES_APP_PASSWORD: "",
      },
      encoding: "utf8",
    });
    expect(result.status).toBe(78);
    expect(result.stderr).toContain("POSTGRES_DB");
    expect(result.stderr).not.toContain("password");
  });

  it("rejects development placeholders and a shared bootstrap/runtime role", () => {
    for (const environment of [
      { ...secureEnvironment, POSTGRES_PASSWORD: "cliqero-local" },
      { ...secureEnvironment, POSTGRES_APP_USER: "cliqero_runtime" },
      { ...secureEnvironment, POSTGRES_APP_USER: secureEnvironment.POSTGRES_USER },
    ]) {
      const result = spawnSync("bash", [entrypoint, "postgres"], {
        env: { ...process.env, ...environment },
        encoding: "utf8",
      });
      expect(result.status).toBe(78);
      expect(result.stderr).not.toContain(environment.POSTGRES_PASSWORD);
      expect(result.stderr).not.toContain(environment.POSTGRES_APP_PASSWORD);
    }
  });
});
