import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OutboxWorkerHealth } from "@/workers/outbox/health";

describe("outbox worker health signal", () => {
  let directory: string | undefined;

  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  });

  function health(now: () => number = () => 10_000) {
    directory = mkdtempSync(path.join(tmpdir(), "cliqero-outbox-health-"));
    return new OutboxWorkerHealth(path.join(directory, "heartbeat"), now);
  }

  it("is unhealthy before a completed polling iteration", () => {
    expect(health().isHealthy()).toBe(false);
  });

  it("records an atomic heartbeat after a successful iteration, including an empty poll", () => {
    const signal = health();
    signal.recordSuccessfulIteration();
    expect(readFileSync(path.join(directory!, "heartbeat"), "utf8")).toBe("10000\n");
    expect(signal.isHealthy()).toBe(true);
  });

  it("clears an old heartbeat when a worker process starts", () => {
    const signal = health();
    signal.recordSuccessfulIteration();
    signal.clear();
    expect(signal.isHealthy()).toBe(false);
  });

  it("becomes unhealthy when the last successful iteration is stale", () => {
    const signal = health(() => 10_000);
    signal.recordSuccessfulIteration();
    const staleSignal = new OutboxWorkerHealth(path.join(directory!, "heartbeat"), () => 310_001);
    expect(staleSignal.isHealthy(300_000)).toBe(false);
  });

  it("rejects invalid and future heartbeat timestamps", () => {
    const signal = health(() => 10_000);
    signal.recordSuccessfulIteration();
    expect(signal.isHealthy(0)).toBe(false);
    const futureSignal = new OutboxWorkerHealth(path.join(directory!, "heartbeat"), () => 9_999);
    expect(futureSignal.isHealthy()).toBe(false);
  });
});
