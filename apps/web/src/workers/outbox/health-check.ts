import { OutboxWorkerHealth } from "./health";

const configuredPollMilliseconds = Number(process.env.OUTBOX_POLL_MS);
const pollMilliseconds =
  Number.isSafeInteger(configuredPollMilliseconds) && configuredPollMilliseconds > 0
    ? configuredPollMilliseconds
    : 1_000;

if (!new OutboxWorkerHealth().isHealthy(Math.max(300_000, pollMilliseconds * 3)))
  process.exitCode = 1;
