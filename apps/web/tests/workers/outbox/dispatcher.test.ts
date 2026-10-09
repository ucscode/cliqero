import { describe, expect, it, vi } from "vitest";
import type { ClaimedOutboxEvent } from "@/kernel/events";
import type { PostgresOutbox } from "@/infrastructure/postgres/shared/outbox";
import { OutboxDispatcher, OutboxHandlerRegistry } from "@/workers/outbox/dispatcher";

describe("OutboxDispatcher processing health", () => {
  function event(): ClaimedOutboxEvent {
    return {
      id: "event-1",
      name: "test.event",
      aggregateId: "aggregate-1",
      correlationId: "correlation-1",
      payload: {},
      occurredAt: new Date("2026-01-01T00:00:00.000Z"),
      attemptCount: 1,
    };
  }

  function outbox(events: ClaimedOutboxEvent[]) {
    return {
      recoverAbandoned: vi.fn(async () => 0),
      claim: vi.fn(async () => events),
      markPublished: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => undefined),
    } as unknown as PostgresOutbox;
  }

  it("reports healthy after all claimed work is published", async () => {
    const registry = new OutboxHandlerRegistry().register({
      eventNames: ["test.event"],
      handle: vi.fn(async () => undefined),
    });
    const dispatcher = new OutboxDispatcher("test-worker", outbox([event()]), registry, {
      info: vi.fn(),
      error: vi.fn(),
    });

    await dispatcher.runOnce();

    expect(dispatcher.lastIterationHealthy).toBe(true);
  });

  it("reports unhealthy when claimed work fails even if failure persistence succeeds", async () => {
    const registry = new OutboxHandlerRegistry().register({
      eventNames: ["test.event"],
      handle: vi.fn(async () => {
        throw new Error("handler unavailable");
      }),
    });
    const dispatcher = new OutboxDispatcher("test-worker", outbox([event()]), registry, {
      info: vi.fn(),
      error: vi.fn(),
    });

    await dispatcher.runOnce();

    expect(dispatcher.lastIterationHealthy).toBe(false);
  });
});
