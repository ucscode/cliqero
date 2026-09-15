import type { Id } from "./ids";

export interface DomainEvent<TPayload extends object = object> {
  readonly id: Id;
  readonly name: string;
  readonly aggregateId: Id;
  readonly occurredAt: Date;
  readonly correlationId: Id;
  readonly payload: TPayload;
}

export interface EventOutbox {
  append(events: readonly DomainEvent[]): Promise<void>;
}

/** Durable event shape shared by application handlers and outer workers. */
export interface ClaimedOutboxEvent {
  id: string;
  name: string;
  aggregateId: string;
  correlationId: string;
  payload: object;
  occurredAt: Date;
  attemptCount: number;
}

export interface OutboxEventHandler {
  readonly eventNames: readonly string[];
  handle(event: ClaimedOutboxEvent): Promise<void>;
}
