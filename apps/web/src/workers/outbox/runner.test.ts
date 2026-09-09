import { describe, expect, it, vi } from "vitest";
import { boundedBackoff, runWorkerLoop } from "./runner";

describe("outbox worker retry loop", () => {
  it("uses bounded exponential backoff", () => {
    expect(boundedBackoff(1, 100, 1_000)).toBe(100);
    expect(boundedBackoff(2, 100, 1_000)).toBe(200);
    expect(boundedBackoff(5, 100, 1_000)).toBe(1_000);
  });

  it("backs off after failures and resets after recovery", async () => {
    const abort = new AbortController();
    const delays: number[] = [];
    const logger = { info: vi.fn(), error: vi.fn() };
    let attempts = 0;
    await runWorkerLoop({
      signal: abort.signal,
      pollMilliseconds: 10,
      retryBaseMilliseconds: 100,
      retryMaxMilliseconds: 1_000,
      runIteration: async () => {
        attempts += 1;
        if (attempts === 1 || attempts === 2 || attempts === 4) {
          if (attempts === 4) abort.abort();
          throw new Error("database unavailable");
        }
        return 1;
      },
      logger,
      sleep: async (delay) => {
        delays.push(delay);
      },
    });
    expect(delays).toEqual([100, 200, 100]);
    expect(logger.error).toHaveBeenCalledTimes(3);
    expect(logger.info).toHaveBeenCalledWith({ failures: 2 }, "commercial.worker.recovered");
  });

  it("stops promptly when the signal is aborted during backoff", async () => {
    const abort = new AbortController();
    const logger = { info: vi.fn(), error: vi.fn() };
    const loop = runWorkerLoop({
      signal: abort.signal,
      pollMilliseconds: 10,
      retryBaseMilliseconds: 100,
      retryMaxMilliseconds: 1_000,
      runIteration: async () => {
        abort.abort();
        throw new Error("database unavailable");
      },
      logger,
    });
    await expect(loop).resolves.toBeUndefined();
  });
});
