import type { WorkerLogger } from "./dispatcher";

export type WorkerRunnerOptions = {
  signal: AbortSignal;
  pollMilliseconds: number;
  retryBaseMilliseconds: number;
  retryMaxMilliseconds: number;
  runIteration: () => Promise<number>;
  logger: WorkerLogger;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};

/** Runs the combined worker loop with bounded retry backoff. */
export async function runWorkerLoop(options: WorkerRunnerOptions): Promise<void> {
  const sleep = options.sleep ?? wait;
  let failures = 0;
  options.logger.info({}, "commercial.worker.started");
  while (!options.signal.aborted) {
    try {
      const processed = await options.runIteration();
      if (failures > 0) options.logger.info({ failures }, "commercial.worker.recovered");
      failures = 0;
      if (processed === 0) await sleep(options.pollMilliseconds, options.signal);
    } catch (error) {
      failures += 1;
      const delay = boundedBackoff(
        failures,
        options.retryBaseMilliseconds,
        options.retryMaxMilliseconds,
      );
      options.logger.error(
        {
          ...(typeof (error as { family?: unknown })?.family === "string"
            ? { processor_family: (error as { family: string }).family }
            : {}),
          error: error instanceof Error ? error.message : String(error),
          retry_in_ms: delay,
        },
        "commercial.worker.iteration.failed",
      );
      await sleep(delay, options.signal);
    }
  }
  options.logger.info({}, "commercial.worker.stopped");
}

export function boundedBackoff(
  failureNumber: number,
  baseMilliseconds: number,
  maxMilliseconds: number,
): number {
  const exponent = Math.max(0, failureNumber - 1);
  return Math.min(maxMilliseconds, baseMilliseconds * 2 ** exponent);
}

export function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timeout = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}
