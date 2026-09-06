import type { SqlExecutor } from "./database";
import type { PayoutFailureCategory, PayoutResult } from "@/modules/withdrawal/provider";
export interface PayoutExecution {
  id: string;
  withdrawalId: string;
  providerName: string;
  idempotencyKey: string;
  state: "ready" | "submitted" | "succeeded" | "failed" | "unknown";
  attemptCount: number;
  nextAttemptAt: Date | null;
  lastError: string | null;
}
export interface PayoutAttempt {
  id: string;
  executionId: string;
  withdrawalId: string;
  providerName: string;
  providerRequestKey: string;
  providerReference: string | null;
  amountMinor: string;
  currency: string;
  state: string;
  failureCategory: PayoutFailureCategory | null;
  failureReason: string | null;
  providerMetadata: unknown;
  correlationId: string;
  attemptNumber: number;
}
export class PostgresPayoutRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async getExecutionForUpdate(withdrawalId: string) {
    const row = (
      await this.sql.query<any>(
        `select e.uuid as id,(select uuid from withdrawal_capability.withdrawals where id=e.withdrawal_id) as withdrawal_id,e.provider_name,e.idempotency_key,e.state,e.attempt_count,e.next_attempt_at,e.last_error from payout_capability.executions e where e.withdrawal_id=(select id from withdrawal_capability.withdrawals where uuid=$1) for update`,
        [withdrawalId],
      )
    ).rows[0];
    return row ? this.mapExecution(row) : null;
  }
  async createExecution(value: {
    id: string;
    withdrawalId: string;
    providerName: string;
    idempotencyKey: string;
  }): Promise<PayoutExecution> {
    await this.sql.query(
      `insert into payout_capability.executions(uuid,withdrawal_id,provider_name,idempotency_key) values($1,(select id from withdrawal_capability.withdrawals where uuid=$2),$3,$4)`,
      [value.id, value.withdrawalId, value.providerName, value.idempotencyKey],
    );
    return { ...value, state: "ready", attemptCount: 0, nextAttemptAt: null, lastError: null };
  }
  async createAttempt(value: {
    id: string;
    executionId: string;
    withdrawalId: string;
    providerName: string;
    providerRequestKey: string;
    amountMinor: string;
    currency: string;
    correlationId: string;
    attemptNumber: number;
  }): Promise<void> {
    await this.sql.query(
      `insert into payout_capability.attempts(uuid,execution_id,withdrawal_id,provider_name,provider_request_key,amount_minor,currency,state,attempt_number,correlation_id) values($1,(select id from payout_capability.executions where uuid=$2),(select id from withdrawal_capability.withdrawals where uuid=$3),$4,$5,$6,$7,'submitted',$8,$9)`,
      [
        value.id,
        value.executionId,
        value.withdrawalId,
        value.providerName,
        value.providerRequestKey,
        value.amountMinor,
        value.currency,
        value.attemptNumber,
        value.correlationId,
      ],
    );
    await this.sql.query(
      `update payout_capability.executions set state='submitted',attempt_count=$2,updated_at=now() where uuid=$1`,
      [value.executionId, value.attemptNumber],
    );
  }
  async finishAttempt(attemptId: string, executionId: string, result: PayoutResult): Promise<void> {
    const state =
      result.kind === "succeeded" ? "succeeded" : result.kind === "failed" ? "failed" : "unknown";
    const category =
      result.kind === "failed"
        ? result.category
        : result.kind === "unknown" || result.kind === "pending"
          ? "unknown"
          : null;
    const reason = result.kind === "succeeded" ? null : result.reason;
    await this.sql.query(
      `update payout_capability.attempts set state=$2,provider_reference=$3,failure_category=$4,failure_reason=$5,provider_metadata=$6::jsonb,completed_at=now() where uuid=$1`,
      [
        attemptId,
        state,
        result.providerReference ?? null,
        category,
        reason,
        result.metadata ? JSON.stringify(result.metadata) : null,
      ],
    );
    await this.sql.query(
      `update payout_capability.executions set state=$2,last_error=$3,next_attempt_at=case when $2='failed' then now()+interval '30 seconds' else null end,updated_at=now() where uuid=$1`,
      [executionId, state, reason],
    );
  }
  async latestAttempt(executionId: string) {
    const row = (
      await this.sql.query<any>(
        `select a.uuid as id,(select uuid from payout_capability.executions where id=a.execution_id) as execution_id,(select uuid from withdrawal_capability.withdrawals where id=a.withdrawal_id) as withdrawal_id,a.provider_name,a.provider_request_key,a.provider_reference,a.amount_minor,a.currency,a.state,a.failure_category,a.failure_reason,a.provider_metadata,a.correlation_id,a.attempt_number from payout_capability.attempts a where a.execution_id=(select id from payout_capability.executions where uuid=$1) order by a.attempt_number desc limit 1`,
        [executionId],
      )
    ).rows[0];
    return row ? this.mapAttempt(row) : null;
  }
  async findAttemptByProviderReference(providerName: string, providerReference: string) {
    const row = (
      await this.sql.query<any>(
        `select a.uuid as id,(select uuid from payout_capability.executions where id=a.execution_id) as execution_id,(select uuid from withdrawal_capability.withdrawals where id=a.withdrawal_id) as withdrawal_id,a.provider_name,a.provider_request_key,a.provider_reference,a.amount_minor,a.currency,a.state,a.failure_category,a.failure_reason,a.provider_metadata,a.correlation_id,a.attempt_number from payout_capability.attempts a where a.provider_name=$1 and a.provider_reference=$2 order by a.attempt_number desc limit 1`,
        [providerName, providerReference],
      )
    ).rows[0];
    return row ? this.mapAttempt(row) : null;
  }
  async listAttempts(withdrawalId: string) {
    const rows = (
      await this.sql.query<any>(
        `select a.uuid as id,(select uuid from payout_capability.executions where id=a.execution_id) as execution_id,(select uuid from withdrawal_capability.withdrawals where id=a.withdrawal_id) as withdrawal_id,a.provider_name,a.provider_request_key,a.provider_reference,a.amount_minor,a.currency,a.state,a.failure_category,a.failure_reason,a.provider_metadata,a.correlation_id,a.attempt_number from payout_capability.attempts a where a.withdrawal_id=(select id from withdrawal_capability.withdrawals where uuid=$1) order by a.attempt_number desc`,
        [withdrawalId],
      )
    ).rows;
    return rows.map((row) => this.mapAttempt(row));
  }
  private mapExecution(row: any): PayoutExecution {
    return {
      id: row.id,
      withdrawalId: row.withdrawal_id,
      providerName: row.provider_name,
      idempotencyKey: row.idempotency_key,
      state: row.state,
      attemptCount: row.attempt_count,
      nextAttemptAt: row.next_attempt_at,
      lastError: row.last_error,
    };
  }
  private mapAttempt(row: any): PayoutAttempt {
    return {
      id: row.id,
      executionId: row.execution_id,
      withdrawalId: row.withdrawal_id,
      providerName: row.provider_name,
      providerRequestKey: row.provider_request_key,
      providerReference: row.provider_reference,
      amountMinor: row.amount_minor,
      currency: row.currency,
      state: row.state,
      failureCategory: row.failure_category,
      failureReason: row.failure_reason,
      providerMetadata: row.provider_metadata,
      correlationId: row.correlation_id,
      attemptNumber: row.attempt_number,
    };
  }
}
