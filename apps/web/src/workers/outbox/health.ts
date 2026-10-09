import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

export const OUTBOX_HEALTH_FILE = "/tmp/cliqero-outbox-worker-health";

export class OutboxWorkerHealth {
  constructor(
    private readonly filePath = OUTBOX_HEALTH_FILE,
    private readonly now: () => number = Date.now,
  ) {}

  clear(): void {
    try {
      unlinkSync(this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  recordSuccessfulIteration(): void {
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    try {
      writeFileSync(temporaryPath, `${this.now()}\n`, { mode: 0o600 });
      renameSync(temporaryPath, this.filePath);
    } catch (error) {
      try {
        unlinkSync(temporaryPath);
      } catch {
        // The temporary file may not have been created.
      }
      throw error;
    }
  }

  isHealthy(maxAgeMilliseconds = 300_000): boolean {
    try {
      const recordedAt = Number(readFileSync(this.filePath, "utf8").trim());
      const age = this.now() - recordedAt;
      return (
        Number.isSafeInteger(recordedAt) &&
        recordedAt > 0 &&
        Number.isFinite(maxAgeMilliseconds) &&
        maxAgeMilliseconds > 0 &&
        age >= 0 &&
        age <= maxAgeMilliseconds
      );
    } catch {
      return false;
    }
  }
}
