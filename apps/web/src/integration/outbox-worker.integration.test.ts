import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";
import type { ClaimedOutboxEvent } from "@/infrastructure/postgres/outbox";
import {
  OutboxDispatcher,
  OutboxHandlerRegistry,
  type OutboxEventHandler,
  type WorkerLogger,
} from "@/workers/outbox/dispatcher";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const silent: WorkerLogger = { info: () => undefined, error: () => undefined };
suite("PostgreSQL outbox dispatcher", () => {
  const app = createContainer(databaseUrl!);
  beforeEach(() =>
    app.database.query(
      `truncate table kernel.outbox_events,kernel.idempotency_records,kernel.audit_records restart identity cascade`,
    ),
  );
  afterAll(() => app.database.close());
  async function append(name = "test.event") {
    const id = newId();
    await app.outbox.append([
      {
        id,
        name,
        aggregateId: newId(),
        correlationId: newId(),
        occurredAt: new Date(),
        payload: {},
      },
    ]);
    return id;
  }
  function dispatcher(workerId: string, handler: OutboxEventHandler, options = {}) {
    return new OutboxDispatcher(
      workerId,
      app.outbox,
      new OutboxHandlerRegistry().register(handler),
      silent,
      { pollMilliseconds: 1, staleAfterMilliseconds: 100, ...options },
    );
  }

  it("processes pending events and marks successful delivery published", async () => {
    const id = await append();
    let handled = 0;
    await dispatcher("worker-a", {
      eventNames: ["test.event"],
      handle: async () => {
        handled++;
      },
    }).runOnce();
    const row = (
      await app.database.query<{ state: string; attempt_count: number }>(
        `select state,attempt_count from kernel.outbox_events where id=$1`,
        [id],
      )
    ).rows[0];
    expect(handled).toBe(1);
    expect(row).toMatchObject({ state: "published", attempt_count: 1 });
  });
  it("records handler failure and retries safely", async () => {
    const id = await append();
    let attempts = 0;
    const worker = dispatcher("worker-a", {
      eventNames: ["test.event"],
      handle: async () => {
        if (++attempts === 1) throw new Error("temporary");
      },
    });
    await worker.runOnce();
    let row = (
      await app.database.query<{ state: string; last_error: string }>(
        `select state,last_error from kernel.outbox_events where id=$1`,
        [id],
      )
    ).rows[0];
    expect(row).toMatchObject({ state: "failed", last_error: "temporary" });
    await app.database.query(`update kernel.outbox_events set available_at=now() where id=$1`, [
      id,
    ]);
    await worker.runOnce();
    row = (
      await app.database.query(`select state,last_error from kernel.outbox_events where id=$1`, [
        id,
      ])
    ).rows[0] as { state: string; last_error: string };
    expect(row.state).toBe("published");
    expect(attempts).toBe(2);
  });
  it("prevents two workers from owning the same event simultaneously", async () => {
    await append();
    let handled = 0;
    const handler = {
      eventNames: ["test.event"],
      handle: async () => {
        handled++;
        await new Promise((resolve) => setTimeout(resolve, 30));
      },
    };
    const counts = await Promise.all([
      dispatcher("worker-a", handler).runOnce(),
      dispatcher("worker-b", handler).runOnce(),
    ]);
    expect(counts.sort()).toEqual([0, 1]);
    expect(handled).toBe(1);
  });
  it("recovers abandoned processing claims", async () => {
    const id = await append();
    await app.outbox.claim("crashed-worker", 1);
    await app.database.query(
      `update kernel.outbox_events set claimed_at=now()-interval '10 minutes' where id=$1`,
      [id],
    );
    let handled = 0;
    await dispatcher("replacement", {
      eventNames: ["test.event"],
      handle: async () => {
        handled++;
      },
    }).runOnce();
    expect(handled).toBe(1);
    expect(
      (
        await app.database.query<{ state: string }>(
          `select state from kernel.outbox_events where id=$1`,
          [id],
        )
      ).rows[0].state,
    ).toBe("published");
  });
  it("supports an idempotent consumer when delivery is repeated", async () => {
    const id = await append();
    const handler: OutboxEventHandler = {
      eventNames: ["test.event"],
      handle: async (event: ClaimedOutboxEvent) =>
        app.database.transaction(async () => {
          if (!(await app.idempotency.begin("test-consumer", event.id))) return;
          await app.database.query(
            `insert into kernel.audit_records(action,subject_type,subject_id,correlation_id) values ('handled','event',$1,$2)`,
            [event.id, event.correlationId],
          );
          await app.idempotency.complete("test-consumer", event.id, event.id);
        }),
    };
    const worker = dispatcher("worker-a", handler);
    await worker.runOnce();
    await app.database.query(
      `update kernel.outbox_events set state='pending',published_at=null,available_at=now() where id=$1`,
      [id],
    );
    await worker.runOnce();
    expect(
      (await app.database.query(`select id from kernel.audit_records where subject_id=$1`, [id]))
        .rowCount,
    ).toBe(1);
  });
});
