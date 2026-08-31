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
