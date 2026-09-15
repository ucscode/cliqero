import { newId } from "@/kernel/ids";
import type { SqlExecutor } from "@/infrastructure/postgres/shared/database";

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
interface AttemptRow {
  id: string;
  payment_id: string;
  idempotency_key: string;
  state: ReconciliationState;
  result: unknown;
  last_error: string | null;
  actor_id: string;
  correlation_id: string;
}
export class PostgresPaymentOperationsRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async recordProviderFailure(input: {
    paymentId: string;
    provider: string;
    operation: string;
    error: {
      httpStatus?: number;
      providerStatus?: boolean;
      providerMessage: string;
      providerCode?: string;
      kind: string;
    };
  }): Promise<void> {
    await this.sql.query(
      `insert into payment_capability.provider_operations(uuid,payment_id,provider,operation,outcome,http_status,provider_status,provider_message,provider_code,failure_kind) values($1,(select id from payment_capability.payments where uuid=$2),$3,$4,'failed',$5,$6,$7,$8,$9)`,
      [
        newId(),
        input.paymentId,
        input.provider,
        input.operation,
        input.error.httpStatus ?? null,
        input.error.providerStatus ?? null,
        input.error.providerMessage.slice(0, 1000),
        input.error.providerCode ?? null,
        input.error.kind,
      ],
    );
  }
  async recordFundingSuccess(input: {
    fundingId: string;
    provider: string;
    operation: string;
    providerMessage?: string;
  }) {
    await this.sql.query(
      `insert into payment_capability.provider_operations(uuid,funding_id,provider,operation,outcome,provider_message) values($1,(select id from funding_capability.funding_transactions where uuid=$2),$3,$4,'succeeded',$5)`,
      [newId(), input.fundingId, input.provider, input.operation, input.providerMessage ?? null],
    );
  }
  async recordFundingFailure(input: {
    fundingId: string;
    provider: string;
    operation: string;
    error: {
      httpStatus?: number;
      providerStatus?: boolean;
      providerMessage: string;
      providerCode?: string;
      kind: string;
    };
  }) {
    await this.sql.query(
      `insert into payment_capability.provider_operations(uuid,funding_id,provider,operation,outcome,http_status,provider_status,provider_message,provider_code,failure_kind) values($1,(select id from funding_capability.funding_transactions where uuid=$2),$3,$4,'failed',$5,$6,$7,$8,$9)`,
      [
        newId(),
        input.fundingId,
        input.provider,
        input.operation,
        input.error.httpStatus ?? null,
        input.error.providerStatus ?? null,
        input.error.providerMessage.slice(0, 1000),
        input.error.providerCode ?? null,
        input.error.kind,
      ],
    );
  }
  async begin(input: {
    paymentId: string;
    idempotencyKey: string;
    actorId: string;
    correlationId: string;
  }): Promise<{ attempt: ReconciliationAttempt; created: boolean }> {
    const result = await this.sql.query<AttemptRow>(
      `insert into payment_capability.reconciliation_attempts(uuid,payment_id,idempotency_key,state,actor_id,correlation_id)
      values($1,(select id from payment_capability.payments where uuid=$2),$3,'started',(select id from identity_capability.accounts where uuid=$4),$5) on conflict(payment_id,idempotency_key) do nothing
      returning uuid as id,(select uuid from payment_capability.payments where id=reconciliation_attempts.payment_id) as payment_id,idempotency_key,state,result,last_error,(select uuid from identity_capability.accounts where id=reconciliation_attempts.actor_id) as actor_id,correlation_id`,
      [newId(), input.paymentId, input.idempotencyKey, input.actorId, input.correlationId],
    );
    if (result.rows[0]) return { attempt: this.map(result.rows[0]), created: true };
    const existing = await this.find(input.paymentId, input.idempotencyKey);
    if (!existing) throw new Error("Reconciliation conflict could not be resolved");
    return { attempt: existing, created: false };
  }
  async finish(
    id: string,
    state: Exclude<ReconciliationState, "started">,
    result: unknown,
    error?: string,
  ): Promise<void> {
    await this.sql.query(
      `update payment_capability.reconciliation_attempts set state=$2,result=$3::jsonb,last_error=$4,completed_at=now() where uuid=$1`,
      [id, state, JSON.stringify(result), error?.slice(0, 4000) ?? null],
    );
  }
  private async find(paymentId: string, key: string) {
    const row = (
      await this.sql.query<AttemptRow>(
        `select a.uuid as id,(select uuid from payment_capability.payments where id=a.payment_id) as payment_id,a.idempotency_key,a.state,a.result,a.last_error,(select uuid from identity_capability.accounts where id=a.actor_id) as actor_id,a.correlation_id from payment_capability.reconciliation_attempts a where a.payment_id=(select id from payment_capability.payments where uuid=$1) and a.idempotency_key=$2`,
        [paymentId, key],
      )
    ).rows[0];
    return row ? this.map(row) : null;
  }
  private map(row: AttemptRow): ReconciliationAttempt {
    return {
      id: row.id,
      paymentId: row.payment_id,
      idempotencyKey: row.idempotency_key,
      state: row.state,
      result: row.result,
      lastError: row.last_error,
      actorId: row.actor_id,
      correlationId: row.correlation_id,
    };
  }
}
