import { afterEach, describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ size: 0 }),
  truncate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("node:fs/promises", () => fsMocks);

import {
  createDevelopmentDiagnosticWriter,
  writeApiDevelopmentDiagnostic,
  writeDevelopmentDiagnostic,
} from "@/infrastructure/development-log";

describe("development diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fsMocks.appendFile.mockClear();
    fsMocks.mkdir.mockReset().mockResolvedValue(undefined);
    fsMocks.stat.mockReset().mockResolvedValue({ size: 0 });
    fsMocks.truncate.mockReset().mockResolvedValue(undefined);
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

  it("appends while the development log is under its configured cap", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEVELOPMENT_LOG_MAX_BYTES", "1000");
    fsMocks.stat.mockResolvedValue({ size: 99 });

    writeDevelopmentDiagnostic({ level: "info", event: "under_cap" });
    await new Promise((resolve) => setImmediate(resolve));

    expect(fsMocks.truncate).not.toHaveBeenCalled();
    expect(fsMocks.appendFile).toHaveBeenCalledOnce();
  });

  it("truncates before appending when the development log reaches its cap", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEVELOPMENT_LOG_MAX_BYTES", "100");
    fsMocks.stat.mockResolvedValue({ size: 100 });

    writeDevelopmentDiagnostic({ level: "info", event: "first_after_truncation" });
    await new Promise((resolve) => setImmediate(resolve));

    expect(fsMocks.truncate).toHaveBeenCalledWith(expect.stringContaining("development.log"), 0);
    expect(fsMocks.truncate.mock.invocationCallOrder[0]).toBeLessThan(
      fsMocks.appendFile.mock.invocationCallOrder[0],
    );
    expect(fsMocks.appendFile).toHaveBeenCalledWith(
      expect.stringContaining("development.log"),
      expect.stringContaining('"event":"first_after_truncation"'),
      "utf8",
    );
  });

  it("uses the default cap when the configured limit is invalid", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEVELOPMENT_LOG_MAX_BYTES", "not-a-number");
    fsMocks.stat.mockResolvedValue({ size: 5 * 1024 * 1024 });

    writeDevelopmentDiagnostic({ level: "info", event: "default_cap" });
    await new Promise((resolve) => setImmediate(resolve));

    expect(fsMocks.truncate).toHaveBeenCalledOnce();
  });

  it("does not expose logging I/O failures to the caller", async () => {
    vi.stubEnv("NODE_ENV", "development");
    fsMocks.mkdir.mockRejectedValue(new Error("disk unavailable"));

    expect(() =>
      writeDevelopmentDiagnostic({ level: "error", event: "best_effort" }),
    ).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(fsMocks.appendFile).not.toHaveBeenCalled();
  });

  it("writes API diagnostics to the API log", async () => {
    vi.stubEnv("NODE_ENV", "development");
    writeApiDevelopmentDiagnostic({ level: "error", event: "api.failure" });
    await new Promise((resolve) => setImmediate(resolve));
    expect(fsMocks.appendFile).toHaveBeenCalledWith(
      expect.stringContaining("api.log"),
      expect.stringContaining('"event":"api.failure"'),
      "utf8",
    );
  });

  it("supports safe named log writers and rejects path traversal", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const writer = createDevelopmentDiagnosticWriter("worker.log");
    writer.write({ level: "info", event: "worker.started" });
    expect(() => createDevelopmentDiagnosticWriter("../outside.log")).toThrow(
      "Invalid development diagnostic log file",
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(fsMocks.appendFile).toHaveBeenCalledWith(
      expect.stringContaining("worker.log"),
      expect.stringContaining('"event":"worker.started"'),
      "utf8",
    );
  });

  it("supports the process log through the same writer implementation", async () => {
    vi.stubEnv("NODE_ENV", "development");
    createDevelopmentDiagnosticWriter("process.log").write({
      level: "error",
      event: "process.failure",
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(fsMocks.appendFile).toHaveBeenCalledWith(
      expect.stringContaining("process.log"),
      expect.stringContaining('"event":"process.failure"'),
      "utf8",
    );
  });

  it("considers the incoming record before deciding whether to truncate", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEVELOPMENT_LOG_MAX_BYTES", "1000");
    fsMocks.stat.mockResolvedValue({ size: 999 });
    writeDevelopmentDiagnostic({ level: "info", event: "record_would_overshoot" });
    await new Promise((resolve) => setImmediate(resolve));
    expect(fsMocks.truncate).toHaveBeenCalledOnce();
  });

  it("truncates an oversized record to the configured cap without reading the file", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEVELOPMENT_LOG_MAX_BYTES", "80");
    writeDevelopmentDiagnostic({ level: "info", event: "x".repeat(500) });
    await new Promise((resolve) => setImmediate(resolve));
    const record = String(fsMocks.appendFile.mock.calls[0]?.[1]);
    expect(Buffer.byteLength(record, "utf8")).toBeLessThanOrEqual(80);
    expect(fsMocks.stat).toHaveBeenCalled();
  });
});
