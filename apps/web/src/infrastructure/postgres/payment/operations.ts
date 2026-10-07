import { newId } from "@/kernel/ids";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type { ReconciliationOperations as ReconciliationResourceOperations } from "@/application/payment/reconciliation-contracts";

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
interface AttemptRow {
  id: string;
  payment_id: string;
  idempotency_key: string;
  state: ReconciliationState;
  result: unknown;
  last_error: string | null;
  actor_id: string;
  correlation_id: string;
  started_at: Date | string;
  completed_at: Date | string | null;
}
export class PostgresPaymentOperationsRepository implements ReconciliationResourceOperations {
  constructor(private readonly sql: QueryExecutor) {}
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
  async countAmbiguousFundingFailures(input: {
    fundingId: string;
    provider: string;
    operation: string;
  }) {
    const result = await this.sql.query<{ count: string }>(
      `select count(*)::text as count
         from payment_capability.provider_operations
        where funding_id=(select id from funding_capability.funding_transactions where uuid=$1)
          and provider=$2 and operation=$3 and outcome='failed' and failure_kind='ambiguous'`,
      [input.fundingId, input.provider, input.operation],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
  async begin(input: {
    paymentId: string;
    idempotencyKey: string;
    actorId: string;
    correlationId: string;
  }): Promise<{ attempt: ReconciliationAttempt; created: boolean }> {
    const result = await this.sql.query<AttemptRow>(
      `insert into payment_capability.reconciliation_attempts(uuid,payment_id,idempotency_key,state,actor_id,correlation_id)
      values($1,(select id from payment_capability.payments where uuid=$2),$3,'started',(select id from identity_capability.accounts where uuid=$4),$5) on conflict(idempotency_key) do nothing
      returning uuid as id,(select uuid from payment_capability.payments where id=reconciliation_attempts.payment_id) as payment_id,idempotency_key,state,result,last_error,(select uuid from identity_capability.accounts where id=reconciliation_attempts.actor_id) as actor_id,correlation_id,started_at,completed_at`,
      [newId(), input.paymentId, input.idempotencyKey, input.actorId, input.correlationId],
    );
    if (result.rows[0]) return { attempt: this.map(result.rows[0]), created: true };
    const existing = await this.findByIdempotencyKey(input.idempotencyKey);
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
  private async findByIdempotencyKey(key: string) {
    const row = (
      await this.sql.query<AttemptRow>(
        `select a.uuid as id,(select uuid from payment_capability.payments where id=a.payment_id) as payment_id,a.idempotency_key,a.state,a.result,a.last_error,(select uuid from identity_capability.accounts where id=a.actor_id) as actor_id,a.correlation_id,a.started_at,a.completed_at from payment_capability.reconciliation_attempts a where a.idempotency_key=$1`,
        [key],
      )
    ).rows[0];
    return row ? this.map(row) : null;
  }
  async findById(id: string) {
    const row = (
      await this.sql.query<AttemptRow>(
        `select a.uuid as id,(select uuid from payment_capability.payments where id=a.payment_id) as payment_id,a.idempotency_key,a.state,a.result,a.last_error,(select uuid from identity_capability.accounts where id=a.actor_id) as actor_id,a.correlation_id,a.started_at,a.completed_at from payment_capability.reconciliation_attempts a where a.uuid=$1`,
        [id],
      )
    ).rows[0];
    return row ? this.map(row) : null;
  }
  async list(input: {
    paymentId?: string;
    state?: ReconciliationState;
    cursor?: string;
    limit: number;
  }) {
    const cursor = input.cursor ? this.decodeCursor(input.cursor) : null;
    const rows = (
      await this.sql.query<AttemptRow & { cursor_id: string }>(
        `select a.uuid as id,(select uuid from payment_capability.payments where id=a.payment_id) as payment_id,a.idempotency_key,a.state,a.result,a.last_error,(select uuid from identity_capability.accounts where id=a.actor_id) as actor_id,a.correlation_id,a.started_at,a.completed_at,a.id cursor_id
       from payment_capability.reconciliation_attempts a
       where ($1::uuid is null or a.payment_id=(select id from payment_capability.payments where uuid=$1))
         and ($2::text is null or a.state=$2)
         and ($3::timestamptz is null or (a.started_at,a.id)<($3::timestamptz,$4::bigint))
       order by a.started_at desc,a.id desc limit $5`,
        [
          input.paymentId ?? null,
          input.state ?? null,
          cursor?.createdAt ?? null,
          cursor?.id ?? null,
          input.limit + 1,
        ],
      )
    ).rows;
    const visible = rows.slice(0, input.limit);
    return {
      items: visible.map((row) => this.map(row)),
      nextCursor:
        rows.length > input.limit
          ? Buffer.from(
              JSON.stringify({
                createdAt: String(visible.at(-1)!.started_at),
                id: visible.at(-1)!.cursor_id,
              }),
            ).toString("base64url")
          : null,
    };
  }
  private decodeCursor(value: string) {
    try {
      const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
      if (typeof cursor.createdAt !== "string" || !/^\d+$/.test(cursor.id)) throw new Error();
      return { createdAt: cursor.createdAt, id: cursor.id };
    } catch {
      throw new Error("Invalid payment reconciliation cursor");
    }
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
      createdAt:
        row.started_at instanceof Date
          ? row.started_at.toISOString()
          : new Date(row.started_at).toISOString(),
      completedAt: row.completed_at
        ? row.completed_at instanceof Date
          ? row.completed_at.toISOString()
          : new Date(row.completed_at).toISOString()
        : null,
    };
  }
}
