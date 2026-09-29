export type ReconciliationState = "started" | "completed" | "skipped" | "mismatch" | "failed";

export interface ReconciliationAttempt {
  id: string;
  paymentId: string;
  idempotencyKey: string;
  state: ReconciliationState;
  result: unknown;
  lastError: string | null;
  actorId: string;
  correlationId: string;
}

export interface ReconciliationOperations {
  begin(input: {
    paymentId: string;
    idempotencyKey: string;
    actorId: string;
    correlationId: string;
  }): Promise<{ attempt: ReconciliationAttempt; created: boolean }>;
  finish(
    id: string,
    state: Exclude<ReconciliationState, "started">,
    result: unknown,
    error?: string,
  ): Promise<void>;
}
