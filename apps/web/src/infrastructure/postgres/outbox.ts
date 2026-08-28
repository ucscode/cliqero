import type { DomainEvent, EventOutbox } from "@/kernel/events";
import type { SqlExecutor } from "./database";

export interface ClaimedOutboxEvent {
  id: string;
  name: string;
  aggregateId: string;
  correlationId: string;
  payload: object;
  occurredAt: Date;
  attemptCount: number;
}

interface OutboxRow {
  id: string; event_name: string; aggregate_id: string; correlation_id: string;
  payload: object; occurred_at: Date; attempt_count: number;
}

export class PostgresOutbox implements EventOutbox {
  constructor(private readonly sql: SqlExecutor) {}

  async append(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.sql.query(
        `insert into kernel.outbox_events
          (id, event_name, aggregate_id, correlation_id, payload, occurred_at)
         values ($1, $2, $3, $4, $5::jsonb, $6)
         on conflict (id) do nothing`,
        [event.id, event.name, event.aggregateId, event.correlationId, JSON.stringify(event.payload), event.occurredAt],
      );
    }
  }

  async claim(workerId: string, limit = 20): Promise<ClaimedOutboxEvent[]> {
    const result = await this.sql.query<OutboxRow>(
      `with claimable as (
         select id from kernel.outbox_events
         where state in ('pending', 'failed') and available_at <= now()
         order by available_at, occurred_at
         limit $2 for update skip locked
       )
       update kernel.outbox_events event
       set state = 'processing', claimed_at = now(), claimed_by = $1, attempt_count = attempt_count + 1
       from claimable where event.id = claimable.id
       returning event.id, event.event_name, event.aggregate_id, event.correlation_id,
                 event.payload, event.occurred_at, event.attempt_count`,
      [workerId, limit],
    );
    return result.rows.map((row) => ({
      id: row.id, name: row.event_name, aggregateId: row.aggregate_id,
      correlationId: row.correlation_id, payload: row.payload,
      occurredAt: row.occurred_at, attemptCount: row.attempt_count,
    }));
  }

  async recoverAbandoned(staleAfterMilliseconds:number):Promise<number> {
    const result=await this.sql.query(
      `update kernel.outbox_events
       set state='failed',last_error=coalesce(last_error,'Worker claim expired before completion'),
           available_at=now(),claimed_at=null,claimed_by=null
       where state='processing' and claimed_at < now() - ($1 * interval '1 millisecond')`,[staleAfterMilliseconds]);
    return result.rowCount??0;
  }

  async markPublished(id: string, workerId: string): Promise<void> {
    await this.sql.query(
      `update kernel.outbox_events set state = 'published', published_at = now(), claimed_at = null, claimed_by = null
       where id = $1 and state = 'processing' and claimed_by = $2`, [id, workerId],
    );
  }

  async markFailed(id: string, workerId: string, error: string): Promise<void> {
    await this.sql.query(
      `update kernel.outbox_events
       set state = 'failed', last_error = $3, available_at = now() + interval '30 seconds', claimed_at = null, claimed_by = null
       where id = $1 and state = 'processing' and claimed_by = $2`, [id, workerId, error.slice(0, 4000)],
    );
  }
}
