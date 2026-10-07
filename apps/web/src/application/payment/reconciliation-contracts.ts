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
  createdAt: string;
  completedAt: string | null;
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
  findById(id: string): Promise<ReconciliationAttempt | null>;
  list(input: {
    paymentId?: string;
    state?: ReconciliationState;
    cursor?: string;
    limit: number;
  }): Promise<{ items: ReconciliationAttempt[]; nextCursor: string | null }>;
}
