import type { SqlExecutor } from "@/infrastructure/postgres/database";

type WithdrawalState = "requested" | "approved" | "rejected" | "cancelled" | "completed" | "failed";
type Cursor = { createdAt: string; id: string };

function encodeCursor(createdAt: string | Date, id: string) {
  return Buffer.from(
    JSON.stringify({ created_at: new Date(createdAt).toISOString(), id }),
    "utf8",
  ).toString("base64url");
}
function decodeCursor(value?: string): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      created_at?: unknown;
      id?: unknown;
    };
    if (typeof parsed.created_at !== "string" || typeof parsed.id !== "string") throw new Error();
    const date = new Date(parsed.created_at);
    if (Number.isNaN(date.valueOf())) throw new Error();
    return { createdAt: date.toISOString(), id: parsed.id };
  } catch {
    throw new Error("Invalid pagination cursor");
  }
}
function mask(value: string) {
  const trimmed = value.trim();
  return trimmed.length <= 4 ? "••••" : `••••${trimmed.slice(-4)}`;
}

export type OperatorWithdrawal = {
  id: string;
  account: { id: string; handle: string; email: string };
  amountMinor: string;
  currency: string;
  destination: { type: "bank" | "manual"; summary: string };
  state: WithdrawalState;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  reservation: {
    amountMinor: string;
    currency: string;
    state: "reserved" | "released" | "completed";
  } | null;
  payout: {
    provider: string;
    state: "ready" | "submitted" | "succeeded" | "failed" | "unknown";
    attemptCount: number;
    nextAttemptAt: string | null;
    lastError: string | null;
    providerReference: string | null;
  } | null;
  attention: "review" | "payout" | "reconciliation" | "retry" | "retry_wait" | "none";
};

export type OperatorWithdrawalDetail = OperatorWithdrawal & {
  attempts: Array<{
    id: string;
    number: number;
    provider: string;
    state: string;
    providerReference: string | null;
    failureCategory: string | null;
    failureReason: string | null;
    createdAt: string;
    completedAt: string | null;
  }>;
};

function map(row: any): OperatorWithdrawal {
  const payoutState = row.payout_state ?? null;
  const attemptState = row.attempt_state ?? null;
  const attention =
    row.state === "requested"
      ? "review"
      : row.state === "approved" && !payoutState
        ? "payout"
        : payoutState === "unknown" || attemptState === "unknown" || attemptState === "pending"
          ? "reconciliation"
          : payoutState === "failed"
            ? row.next_attempt_at && new Date(row.next_attempt_at) > new Date()
              ? "retry_wait"
              : "retry"
            : "none";
  return {
    id: row.id,
    account: { id: row.account_id, handle: row.handle, email: row.email },
    amountMinor: String(row.amount_minor),
    currency: row.currency,
    destination: { type: row.destination_type, summary: mask(row.destination_reference) },
    state: row.state,
    reason: row.reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reservation: row.reservation_id
      ? {
          amountMinor: String(row.reservation_amount_minor),
          currency: row.reservation_currency,
          state: row.reservation_state,
        }
      : null,
    payout: row.payout_id
      ? {
          provider: row.provider_name,
          state: payoutState,
          attemptCount: Number(row.attempt_count ?? 0),
          nextAttemptAt: row.next_attempt_at ?? null,
          lastError: row.last_error ?? null,
          providerReference: row.provider_reference ?? null,
        }
      : null,
    attention,
  };
}

const projection = `
  select w.id,w.account_id,a.handle,a.email,w.amount_minor,w.currency,w.destination_type,w.destination_reference,w.state,w.reason,w.created_at,w.updated_at,
    r.id reservation_id,r.amount_minor reservation_amount_minor,r.currency reservation_currency,
    (select e.kind from ledger_capability.withdrawal_reservation_events e where e.reservation_id=r.id order by e.created_at desc,e.id desc limit 1) reservation_state,
    p.id payout_id,p.provider_name,p.state payout_state,p.attempt_count,p.next_attempt_at,p.last_error,
    (select a.state from payout_capability.attempts a where a.execution_id=p.id order by a.attempt_number desc limit 1) attempt_state,
    (select a.provider_reference from payout_capability.attempts a where a.execution_id=p.id order by a.attempt_number desc limit 1) provider_reference
   from withdrawal_capability.withdrawals w
   join identity_capability.accounts a on a.id=w.account_id
   left join ledger_capability.withdrawal_reservations r on r.withdrawal_id=w.id
   left join payout_capability.executions p on p.withdrawal_id=w.id`;

export class OperatorWithdrawalService {
  constructor(private readonly sql: SqlExecutor) {}
  async list(input: {
    search?: string;
    state?: WithdrawalState;
    attention?: OperatorWithdrawal["attention"];
    cursor?: string;
    limit: number;
  }) {
    const cursor = decodeCursor(input.cursor);
    const raw = input.search?.trim() || "";
    const search = raw ? raw.replace(/[\\%_]/g, "\\$&") : null;
    const values: unknown[] = [
      search,
      input.state ?? null,
      input.attention ?? null,
      cursor?.createdAt ?? null,
      cursor?.id ?? null,
      input.limit + 1,
    ];
    const rows = (
      await this.sql.query<any>(
        `select * from (${projection}) q
          where ($1::text is null or q.id::text=$1 or q.destination_reference ilike '%'||$1||'%' escape '\\' or q.provider_reference ilike '%'||$1||'%' escape '\\' or q.handle ilike '%'||$1||'%' escape '\\' or q.email ilike '%'||$1||'%' escape '\\')
            and ($2::text is null or q.state=$2)
            and ($3::text is null or case when q.state='requested' then 'review' when q.state='approved' and q.payout_state is null then 'payout' when q.payout_state='unknown' or q.attempt_state in ('unknown','pending') then 'reconciliation' when q.payout_state='failed' and q.next_attempt_at > now() then 'retry_wait' when q.payout_state='failed' then 'retry' else 'none' end=$3::text)
            and ($4::timestamptz is null or (q.created_at,q.id)<($4::timestamptz,$5::uuid))
          order by q.created_at desc,q.id desc limit $6`,
        values,
      )
    ).rows;
    const items = rows
      .slice(0, input.limit)
      .map(map)
      .filter((item) => !input.attention || item.attention === input.attention);
    return {
      items,
      nextCursor:
        rows.length > input.limit && items.length
          ? encodeCursor(rows[input.limit - 1].created_at, rows[input.limit - 1].id)
          : null,
    };
  }
  async get(id: string): Promise<OperatorWithdrawalDetail> {
    const row = (await this.sql.query<any>(`${projection} where w.id=$1`, [id])).rows[0];
    if (!row) throw new Error("Withdrawal not found");
    const attempts = (
      await this.sql.query<any>(
        `select id,attempt_number,provider_name,state,provider_reference,failure_category,failure_reason,created_at,completed_at from payout_capability.attempts where withdrawal_id=$1 order by attempt_number desc limit 100`,
        [id],
      )
    ).rows;
    return {
      ...map(row),
      attempts: attempts.map((a) => ({
        id: a.id,
        number: a.attempt_number,
        provider: a.provider_name,
        state: a.state,
        providerReference: a.provider_reference ?? null,
        failureCategory: a.failure_category ?? null,
        failureReason: a.failure_reason ?? null,
        createdAt: a.created_at,
        completedAt: a.completed_at ?? null,
      })),
    };
  }
}
