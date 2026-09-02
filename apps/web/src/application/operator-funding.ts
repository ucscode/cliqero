import type { SqlExecutor } from "@/infrastructure/postgres/database";

type FundingState =
  | "initialization_pending"
  | "initializing"
  | "awaiting_payment"
  | "verification_pending"
  | "confirmed"
  | "failed"
  | "blocked"
  | "reconciliation_pending";

type Cursor = { createdAt: string; id: string };

function encodeCursor(createdAt: string | Date, id: string) {
  return Buffer.from(
    JSON.stringify({ created_at: new Date(createdAt).toISOString(), id }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(value: string | undefined): Cursor | null {
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

export type OperatorFundingWalletCredit = {
  id: string;
  amountMinor: string;
  currency: string;
  state: "pending" | "available";
  createdAt: string;
  availableAt: string | null;
};

export type OperatorFundingOperation = {
  id: string;
  operation: string;
  outcome: "succeeded" | "failed";
  httpStatus: number | null;
  providerStatus: boolean | null;
  providerMessage: string | null;
  providerCode: string | null;
  failureKind: string | null;
  occurredAt: string;
};

export type OperatorFundingEvent = {
  id: string;
  eventType: string;
  providerReference: string | null;
  amountMinor: string | null;
  currency: string | null;
  state: "received" | "processed" | "rejected" | "ignored";
  lastError: string | null;
  receivedAt: string;
  processedAt: string | null;
  outboxState: string | null;
  outboxLastError: string | null;
};

export type OperatorFundingSummary = {
  id: string;
  account: { id: string; handle: string; email: string };
  provider: string;
  providerReference: string;
  canonicalAmountMinor: string;
  canonicalCurrency: "USD";
  collectionAmountMinor: string;
  collectionCurrency: string;
  state: FundingState;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  walletCredit: OperatorFundingWalletCredit | null;
};

export type OperatorFundingDetail = OperatorFundingSummary & {
  conversionSnapshot: {
    fromCurrency: string;
    toCurrency: string;
    rate: string;
    source: string;
    sourceDate: string;
    observedAt: string;
  } | null;
  providerInitialization: { authorizationUrl: string | null } | null;
  operations: OperatorFundingOperation[];
  events: OperatorFundingEvent[];
};

function summary(row: any): OperatorFundingSummary {
  return {
    id: row.id,
    account: { id: row.account_id, handle: row.handle, email: row.email },
    provider: row.provider_name,
    providerReference: row.provider_reference,
    canonicalAmountMinor: String(row.canonical_amount_minor),
    canonicalCurrency: "USD",
    collectionAmountMinor: String(row.collection_amount_minor),
    collectionCurrency: row.collection_currency,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confirmedAt: row.confirmed_at ?? null,
    walletCredit: row.credit_id
      ? {
          id: row.credit_id,
          amountMinor: String(row.credit_amount_minor),
          currency: row.credit_currency,
          state: row.credit_state,
          createdAt: row.credit_created_at,
          availableAt: row.credit_available_at ?? null,
        }
      : null,
  };
}

export class OperatorFundingService {
  constructor(private readonly sql: SqlExecutor) {}

  async list(input: {
    search?: string;
    state?: FundingState;
    provider?: string;
    cursor?: string;
    limit: number;
  }) {
    const cursor = decodeCursor(input.cursor);
    const rawSearch = input.search?.trim() || "";
    const search = rawSearch ? rawSearch.replace(/[\\%_]/g, "\\$&") : null;
    const values: unknown[] = [search, input.state ?? null, input.provider ?? null];
    const conditions = [
      "($1::text is null or f.id::text=$1 or f.provider_reference ilike '%'||$1||'%' escape '\\' or a.handle ilike '%'||$1||'%' escape '\\' or a.email ilike '%'||$1||'%' escape '\\')",
      "($2::text is null or f.state=$2)",
      "($3::text is null or f.provider_name=$3)",
    ];
    values.push(cursor?.createdAt ?? null, cursor?.id ?? null, input.limit + 1);
    conditions.push("($4::timestamptz is null or (f.created_at,f.id)<($4::timestamptz,$5::uuid))");
    const rows = (
      await this.sql.query<any>(
        `select f.id,f.account_id,a.handle,a.email,f.provider_name,f.provider_reference,
                f.canonical_amount_minor,f.collection_amount_minor,f.collection_currency,
                f.state,f.created_at,f.updated_at,f.confirmed_at,
                c.id credit_id,c.amount_minor credit_amount_minor,c.currency credit_currency,
                c.state credit_state,c.created_at credit_created_at,c.available_at credit_available_at
           from funding_capability.funding_transactions f
           join identity_capability.accounts a on a.id=f.account_id
           left join wallet_capability.credits c on c.funding_id=f.id
          where ${conditions.join(" and ")}
          order by f.created_at desc,f.id desc limit $6`,
        values,
      )
    ).rows;
    const visible = rows.slice(0, input.limit);
    return {
      items: visible.map(summary),
      nextCursor:
        rows.length > input.limit
          ? encodeCursor(visible.at(-1).created_at, visible.at(-1).id)
          : null,
    };
  }

  async get(id: string): Promise<OperatorFundingDetail> {
    const row = (
      await this.sql.query<any>(
        `select f.id,f.account_id,a.handle,a.email,f.provider_name,f.provider_reference,
                f.canonical_amount_minor,f.collection_amount_minor,f.collection_currency,
                f.state,f.created_at,f.updated_at,f.confirmed_at,f.conversion_snapshot,
                case when f.provider_initialization is null then null
                     else jsonb_build_object('authorizationUrl', f.provider_initialization->>'authorizationUrl') end provider_initialization,
                c.id credit_id,c.amount_minor credit_amount_minor,c.currency credit_currency,
                c.state credit_state,c.created_at credit_created_at,c.available_at credit_available_at
           from funding_capability.funding_transactions f
           join identity_capability.accounts a on a.id=f.account_id
           left join wallet_capability.credits c on c.funding_id=f.id
          where f.id=$1`,
        [id],
      )
    ).rows[0];
    if (!row) throw new Error("Funding not found");
    const operations = (
      await this.sql.query<any>(
        `select id,operation,outcome,http_status,provider_status,provider_message,provider_code,failure_kind,occurred_at
           from payment_capability.provider_operations
          where funding_id=$1 order by occurred_at desc,id desc limit 50`,
        [id],
      )
    ).rows;
    const events = (
      await this.sql.query<any>(
        `select e.id,e.event_type,e.provider_reference,e.amount_minor,e.currency,e.state,e.last_error,
                e.received_at,e.processed_at,o.state outbox_state,o.last_error outbox_last_error
           from payment_capability.provider_events e
           left join kernel.outbox_events o on o.aggregate_id=e.id and o.event_name='payment.paystack.charge-succeeded'
          where e.provider_name=$1 and e.provider_reference=$2
          order by e.received_at desc,e.id desc limit 50`,
        [row.provider_name, row.provider_reference],
      )
    ).rows;
    const base = summary(row);
    return {
      ...base,
      conversionSnapshot: row.conversion_snapshot
        ? {
            fromCurrency: row.conversion_snapshot.fromCurrency,
            toCurrency: row.conversion_snapshot.toCurrency,
            rate: row.conversion_snapshot.rate,
            source: row.conversion_snapshot.source,
            sourceDate: row.conversion_snapshot.sourceDate,
            observedAt: new Date(row.conversion_snapshot.observedAt).toISOString(),
          }
        : null,
      providerInitialization: row.provider_initialization
        ? {
            authorizationUrl:
              typeof row.provider_initialization.authorizationUrl === "string"
                ? row.provider_initialization.authorizationUrl
                : null,
          }
        : null,
      operations: operations.map((operation) => ({
        id: operation.id,
        operation: operation.operation,
        outcome: operation.outcome,
        httpStatus: operation.http_status ?? null,
        providerStatus: operation.provider_status ?? null,
        providerMessage: operation.provider_message ?? null,
        providerCode: operation.provider_code ?? null,
        failureKind: operation.failure_kind ?? null,
        occurredAt: operation.occurred_at,
      })),
      events: events.map((event) => ({
        id: event.id,
        eventType: event.event_type,
        providerReference: event.provider_reference ?? null,
        amountMinor: event.amount_minor === null ? null : String(event.amount_minor),
        currency: event.currency ?? null,
        state: event.state,
        lastError: event.last_error ?? null,
        receivedAt: event.received_at,
        processedAt: event.processed_at ?? null,
        outboxState: event.outbox_state ?? null,
        outboxLastError: event.outbox_last_error ?? null,
      })),
    };
  }
}
