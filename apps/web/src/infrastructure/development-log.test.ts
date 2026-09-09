import { afterEach, describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("node:fs/promises", () => fsMocks);

import { writeDevelopmentDiagnostic } from "./development-log";

describe("development diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fsMocks.appendFile.mockClear();
    fsMocks.mkdir.mockClear();
  });

  it("writes JSONL diagnostics with sensitive values redacted", async () => {
    vi.stubEnv("NODE_ENV", "development");
    writeDevelopmentDiagnostic({
      level: "error",
      event: "api.error",
      method: "POST",
      path: "/api/password-reset",
      publicCode: "invalid_reset_token",
      error: new Error("reset token=secret-token authorization: Bearer secret-auth"),
      metadata: { source: "header", password: "secret-password" },
    });
    await new Promise((resolve) => setImmediate(resolve));
    const line = String(fsMocks.appendFile.mock.calls[0]?.[1]);
    expect(line).toContain('"event":"api.error"');
    expect(line).toContain('"public_code":"invalid_reset_token"');
    expect(line).not.toContain("secret-token");
    expect(line).not.toContain("secret-auth");
    expect(line).not.toContain("secret-password");
    expect(line).toContain("[REDACTED]");
  });

  it("is inert outside development", async () => {
    vi.stubEnv("NODE_ENV", "test");
    writeDevelopmentDiagnostic({ level: "error", event: "api.error", error: new Error("boom") });
    await new Promise((resolve) => setImmediate(resolve));
    expect(fsMocks.appendFile).not.toHaveBeenCalled();
    expect(fsMocks.mkdir).not.toHaveBeenCalled();
  });
});
