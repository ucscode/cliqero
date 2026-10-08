import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type { EventOutbox } from "@/kernel/events";
import { FUNDING_PROOF_CLEANUP_EVENT } from "@/kernel/events";
import type {
  OperatorFundingDetail,
  OperatorFundingListInput,
  OperatorFundingProofObject,
  OperatorFundingReader,
  OperatorFundingSummary,
} from "@/application/operator/funding";
import { PublicApplicationError } from "@/kernel/errors";
import { newId } from "@/kernel/ids";

type FundingSort = "created" | "amount";
type FundingDirection = "asc" | "desc";
type FundingCursor = { sort: FundingSort; direction: FundingDirection; value: string; id: string };

function encodeFundingCursor(cursor: FundingCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeFundingCursor(
  token: string | undefined,
  sort: FundingSort,
  direction: FundingDirection,
): FundingCursor | null {
  if (!token) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(token, "base64url").toString("utf8"),
    ) as Partial<FundingCursor>;
    if (
      decoded.sort !== sort ||
      decoded.direction !== direction ||
      typeof decoded.value !== "string" ||
      !zUuid(decoded.id) ||
      (sort === "amount" && !/^\d+$/.test(decoded.value)) ||
      (sort === "created" && Number.isNaN(Date.parse(decoded.value)))
    )
      throw new Error();
    return decoded as FundingCursor;
  } catch {
    throw new PublicApplicationError("Invalid or stale pagination cursor", "invalid_cursor", 400);
  }
}

function zUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function summary(row: any): OperatorFundingSummary {
  return {
    id: row.id,
    account: { id: row.account_id, username: row.username, email: row.email },
    origin: row.origin,
    provider: row.provider_name ?? null,
    providerReference: row.provider_reference ?? null,
    providerTransactionId: row.provider_transaction_id ?? null,
    reason: row.reason ?? null,
    administrativeReference: row.administrative_reference ?? null,
    createdBy: row.created_by ?? null,
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
    walletEffect:
      row.wallet_effect_minor !== null && row.wallet_effect_minor !== undefined
        ? {
            amountMinor: String(row.wallet_effect_minor),
            currency: "USD",
            state: row.wallet_effect_state ?? "none",
          }
        : null,
  };
}

export class PostgresOperatorFundingReader implements OperatorFundingReader {
  constructor(
    private readonly sql: QueryExecutor,
    private readonly outbox?: EventOutbox,
  ) {}

  async list(input: OperatorFundingListInput) {
    const sort = input.sort ?? "created";
    const direction = input.direction ?? "desc";
    const cursor = decodeFundingCursor(input.cursor, sort, direction);
    const orderBy = sort === "amount" ? "q.canonical_amount_minor" : "q.created_at";
    const cursorType = sort === "amount" ? "bigint" : "timestamptz";
    const rawSearch = input.search?.trim() || "";
    const search = rawSearch ? rawSearch.replace(/[\\%_]/g, "\\$&") : null;
    const values: unknown[] = [
      search,
      input.state ?? null,
      input.provider ?? null,
      input.accountId ?? null,
      input.active ?? false,
    ];
    const conditions = [
      "($1::text is null or q.id::text=$1 or coalesce(q.provider_reference,q.administrative_reference,'') ilike '%'||$1||'%' escape '\\' or coalesce(q.reason,'') ilike '%'||$1||'%' escape '\\' or q.username ilike '%'||$1||'%' escape '\\' or q.email ilike '%'||$1||'%' escape '\\')",
      "($2::text is null or q.state=$2)",
      "($3::text is null or q.provider_name=$3)",
      "($4::uuid is null or q.account_id=$4)",
      "(not $5::boolean or q.state in ('initialization_pending','initializing','awaiting_payment','verification_pending'))",
    ];
    if (cursor) {
      values.push(cursor.value, cursor.id);
      conditions.push(
        `(${orderBy},q.id) ${direction === "asc" ? ">" : "<"} ($6::${cursorType},$7::uuid)`,
      );
    }
    values.push(input.limit + 1);
    const rows = (
      await this.sql.query<any>(
        `with q as (
          select f.uuid id,a.uuid account_id,a.username,a.email,
                 'provider'::text origin,f.provider_name,f.provider_reference,f.provider_transaction_id,
                 null::text reason,null::text administrative_reference,null::uuid created_by,
                 f.canonical_amount_minor,f.collection_amount_minor,f.collection_currency,
                 f.state,f.created_at,f.updated_at,f.confirmed_at,
                 c.uuid credit_id,c.amount_minor credit_amount_minor,c.currency credit_currency,
                 c.state credit_state,c.created_at credit_created_at,c.available_at credit_available_at,
                 null::bigint wallet_effect_minor,null::text wallet_effect_state
            from funding_capability.funding_transactions f
            join identity_capability.account_profiles a on a.id=f.account_id
            left join wallet_capability.credits c on c.funding_id=f.id
          union all
          select f.uuid id,a.uuid account_id,a.username,a.email,
                 'administrative'::text origin,null::text provider_name,null::text provider_reference,
                 null::text provider_transaction_id,f.reason,f.reference administrative_reference,
                 actor.uuid created_by,f.amount_minor canonical_amount_minor,f.amount_minor collection_amount_minor,
                 'USD'::text collection_currency,f.state,f.created_at,f.updated_at,
                 case when f.state='confirmed' then f.created_at else null end confirmed_at,
                 null::uuid credit_id,null::bigint credit_amount_minor,null::text credit_currency,
                 null::text credit_state,null::timestamptz credit_created_at,null::timestamptz credit_available_at,
                 coalesce(sum(adj.amount_minor),0)::bigint wallet_effect_minor,
                 case when coalesce(sum(adj.amount_minor),0) <> 0 then 'available' else 'none' end wallet_effect_state
            from funding_capability.administrative_fundings f
            join identity_capability.account_profiles a on a.id=f.account_id
            join identity_capability.accounts actor on actor.id=f.created_by
            left join wallet_capability.funding_adjustments adj on adj.funding_id=f.uuid
            group by f.uuid,f.id,a.uuid,a.username,a.email,actor.uuid
        ) select q.*,${orderBy}::text cursor_sort_value from q
          where ${conditions.join(" and ")}
          order by ${orderBy} ${direction},q.id ${direction} limit $${values.length}`,
        values,
      )
    ).rows;
    const visible = rows.slice(0, input.limit);
    return {
      items: visible.map(summary),
      nextCursor:
        rows.length > input.limit
          ? encodeFundingCursor({
              sort,
              direction,
              value: String(visible.at(-1).cursor_sort_value),
              id: String(visible.at(-1).id),
            })
          : null,
    };
  }

  async get(id: string): Promise<OperatorFundingDetail | null> {
    const row = (
      await this.sql.query<any>(
        `select f.uuid as id,a.uuid as account_id,a.username,a.email,f.provider_name,f.provider_reference,f.provider_transaction_id,
                f.canonical_amount_minor,f.collection_amount_minor,f.collection_currency,
                f.state,f.created_at,f.updated_at,f.confirmed_at,f.conversion_snapshot,
                case when f.provider_initialization is null then null
                     else jsonb_build_object('authorizationUrl', f.provider_initialization->>'authorizationUrl')
                          || case when f.provider_initialization ? 'providerAccountId'
                                  then jsonb_build_object('providerAccountId', f.provider_initialization->>'providerAccountId',
                                                          'providerAccountSnapshot', f.provider_initialization->'providerAccountSnapshot')
                                  else '{}'::jsonb end end provider_initialization,
                c.uuid credit_id,c.amount_minor credit_amount_minor,c.currency credit_currency,
                c.state credit_state,c.created_at credit_created_at,c.available_at credit_available_at,
                null::bigint wallet_effect_minor,null::text wallet_effect_state
           from funding_capability.funding_transactions f
           join identity_capability.account_profiles a on a.id=f.account_id
           left join wallet_capability.credits c on c.funding_id=f.id
          where f.uuid=$1`,
        [id],
      )
    ).rows[0];
    if (!row) {
      const administrative = (
        await this.sql.query<any>(
          `select f.uuid id,a.uuid account_id,a.username,a.email,'administrative'::text origin,
                  null::text provider_name,null::text provider_reference,null::text provider_transaction_id,
                  f.reason,f.reference administrative_reference,actor.uuid created_by,
                  f.amount_minor canonical_amount_minor,f.amount_minor collection_amount_minor,
                  'USD'::text collection_currency,f.state,f.created_at,f.updated_at,
                  case when f.state='confirmed' then f.created_at else null end confirmed_at,
                  null::uuid credit_id,null::bigint credit_amount_minor,null::text credit_currency,
                  null::text credit_state,null::timestamptz credit_created_at,null::timestamptz credit_available_at,
                  coalesce(sum(adj.amount_minor),0)::bigint wallet_effect_minor,
                  case when coalesce(sum(adj.amount_minor),0) <> 0 then 'available' else 'none' end wallet_effect_state
             from funding_capability.administrative_fundings f
             join identity_capability.account_profiles a on a.id=f.account_id
             join identity_capability.accounts actor on actor.id=f.created_by
             left join wallet_capability.funding_adjustments adj on adj.funding_id=f.uuid
            where f.uuid=$1
            group by f.uuid,f.id,a.uuid,a.username,a.email,actor.uuid`,
          [id],
        )
      ).rows[0];
      if (!administrative) return null;
      return {
        ...summary(administrative),
        conversionSnapshot: null,
        providerInitialization: null,
        operations: [],
        events: [],
        evidence: null,
      };
    }
    const operations = (
      await this.sql.query<any>(
        `select uuid as id,operation,outcome,http_status,provider_status,provider_message,provider_code,failure_kind,occurred_at
           from payment_capability.provider_operations
          where funding_id=(select id from funding_capability.funding_transactions where uuid=$1) order by occurred_at desc,id desc limit 50`,
        [id],
      )
    ).rows;
    const evidence = (
      await this.sql.query<any>(
        `select uuid as id,transfer_reference,proof_image_url,customer_note,
                proof_storage_provider,proof_storage_container,proof_object_key,
                proof_original_filename,proof_mime_type,proof_byte_size,created_at
           from funding_capability.funding_evidence
          where funding_id=(select id from funding_capability.funding_transactions where uuid=$1)`,
        [id],
      )
    ).rows[0];
    const events = (
      await this.sql.query<any>(
        `select e.id,e.event_type,e.provider_reference,e.amount_minor,e.currency,e.state,e.last_error,
                e.received_at,e.processed_at,o.state outbox_state,o.last_error outbox_last_error
           from payment_capability.provider_events e
           left join lateral (
             select o.state,o.last_error
               from kernel.outbox_events o
              where o.aggregate_id=e.id
              order by o.occurred_at desc,o.id desc
              limit 1
           ) o on true
          where $1::text is not null and $2::text is not null
            and e.provider_name=$1 and e.provider_reference=$2
          order by e.received_at desc,e.id desc limit 50`,
        [row.provider_name ?? null, row.provider_reference ?? null],
      )
    ).rows;
    const base = summary(row);
    return {
      ...base,
      origin: "provider",
      reason: null,
      administrativeReference: null,
      createdBy: null,
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
            ...(typeof row.provider_initialization.providerAccountId === "string"
              ? { providerAccountId: row.provider_initialization.providerAccountId }
              : {}),
            ...(row.provider_initialization.providerAccountSnapshot
              ? { providerAccountSnapshot: row.provider_initialization.providerAccountSnapshot }
              : {}),
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
      evidence: evidence
        ? {
            id: evidence.id,
            transferReference: evidence.transfer_reference ?? null,
            proof:
              evidence.proof_storage_provider &&
              evidence.proof_storage_container &&
              evidence.proof_object_key
                ? {
                    originalFilename: evidence.proof_original_filename ?? null,
                    mimeType: evidence.proof_mime_type,
                    byteSize: String(evidence.proof_byte_size),
                  }
                : null,
            customerNote: evidence.customer_note ?? null,
            createdAt: new Date(evidence.created_at).toISOString(),
          }
        : null,
    };
  }

  async deleteForRoot(id: string, actorId: string) {
    const owner = (
      await this.sql.query<{ account_id: string }>(
        `select account.uuid account_id from funding_capability.funding_transactions funding
           join identity_capability.accounts account on account.id=funding.account_id
          where funding.uuid=$1`,
        [id],
      )
    ).rows[0];
    if (!owner) throw new Error("Funding not found");
    await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `wallet-transfer:${owner.account_id}`,
    ]);
    const funding = (
      await this.sql.query<{ id: string }>(
        `select id::text from funding_capability.funding_transactions where uuid=$1 for update`,
        [id],
      )
    ).rows[0];
    if (!funding) throw new Error("Funding not found");

    const previous = await this.get(id);
    const reversals = (
      await this.sql.query(
        `select uuid,amount_minor::text,currency,provider_collection_amount_minor::text,
              provider_collection_currency,source,reason,provider_reference,
              provider_event_id,idempotency_key,correlation_id,created_by,actor_system,
              pending_credit_minor::text,funding_wallet_minor::text,
              earnings_wallet_minor::text,debt_minor::text,created_at
         from funding_capability.funding_reversals where funding_id=$1::bigint
         order by created_at,uuid`,
        [funding.id],
      )
    ).rows;
    const reversalIds = reversals.map((reversal) => String(reversal.uuid));
    const credit = (
      await this.sql.query<{ uuid: string }>(
        `select uuid from wallet_capability.credits where funding_id=$1::bigint for update`,
        [funding.id],
      )
    ).rows[0];
    const linkedDebt = (
      await this.sql.query<any>(
        `select entry.uuid,entry.kind,entry.amount_minor::text,entry.wallet,entry.source_kind,
                entry.source_id,entry.reason,entry.actor_kind,actor.uuid actor_id,entry.actor_system,
                entry.correlation_id,entry.idempotency_key,entry.created_at
           from ledger_capability.account_debt_entries entry
           left join identity_capability.accounts actor on actor.id=entry.actor_id
          where entry.account_id=(select id from identity_capability.accounts where uuid=$1)
            and ((entry.source_kind='wallet_funding_credit' and entry.source_id=$2)
              or (entry.source_kind='funding_reversal' and entry.source_id=any($3::text[])))
          order by entry.created_at,entry.id for update of entry`,
        [owner.account_id, credit?.uuid ?? "", reversalIds],
      )
    ).rows;
    const dependentActivity = await this.sql.query(
      `select 1
         from ledger_capability.account_debt_entries increase
         join ledger_capability.account_debt_entries later
           on later.account_id=increase.account_id and later.kind in ('settlement','write_off')
          and (later.created_at,later.id)>(increase.created_at,increase.id)
        where increase.account_id=(select id from identity_capability.accounts where uuid=$1)
          and increase.kind='increase'
          and ((increase.source_kind='wallet_funding_credit' and increase.source_id=$2)
            or (increase.source_kind='funding_reversal' and increase.source_id=any($3::text[])))
          and not ((later.source_kind='wallet_funding_credit' and later.source_id=$2)
            or (later.source_kind='funding_reversal' and later.source_id=any($3::text[])))
        limit 1`,
      [owner.account_id, credit?.uuid ?? "", reversalIds],
    );
    const resultingDebt = (
      await this.sql.query<{ amount: string }>(
        `select coalesce(sum(case when kind='increase' then amount_minor else -amount_minor end),0)::text amount
           from ledger_capability.account_debt_entries entry
          where entry.account_id=(select id from identity_capability.accounts where uuid=$1)
            and not ((entry.source_kind='wallet_funding_credit' and entry.source_id=$2)
              or (entry.source_kind='funding_reversal' and entry.source_id=any($3::text[])))`,
        [owner.account_id, credit?.uuid ?? "", reversalIds],
      )
    ).rows[0];
    if (dependentActivity.rowCount || BigInt(resultingDebt?.amount ?? "0") < 0n)
      throw new PublicApplicationError(
        "Funding deletion conflicts with subsequent account-debt activity.",
        "funding_delete_debt_dependency_conflict",
        409,
      );
    const proofObjects = (
      await this.sql.query<OperatorFundingProofObject>(
        `select proof_storage_provider as provider,
                proof_storage_container as container,
                proof_object_key as key
           from funding_capability.funding_evidence
          where funding_id=$1::bigint
            and proof_storage_provider is not null
            and proof_storage_container is not null
            and proof_object_key is not null`,
        [funding.id],
      )
    ).rows;

    if (proofObjects.length > 0 && !this.outbox)
      throw new Error("Funding proof cleanup outbox is unavailable");

    await this.sql.query("select set_config('cliqero.root_delete','on',true)");
    if (linkedDebt.length)
      await this.sql.query(
        `delete from ledger_capability.account_debt_entries
          where account_id=(select id from identity_capability.accounts where uuid=$1)
            and ((source_kind='wallet_funding_credit' and source_id=$2)
              or (source_kind='funding_reversal' and source_id=any($3::text[])))`,
        [owner.account_id, credit?.uuid ?? "", reversalIds],
      );
    await this.sql.query(
      `delete from funding_capability.funding_reversals where funding_id=$1::bigint`,
      [funding.id],
    );
    await this.sql.query(
      `delete from funding_capability.funding_evidence where funding_id=$1::bigint`,
      [funding.id],
    );
    await this.sql.query(
      `delete from payment_capability.provider_operations where funding_id=$1::bigint`,
      [funding.id],
    );
    await this.sql.query(`delete from wallet_capability.credits where funding_id=$1::bigint`, [
      funding.id,
    ]);
    const deleted = await this.sql.query(
      `delete from funding_capability.funding_transactions where id=$1::bigint`,
      [funding.id],
    );
    if ((deleted.rowCount ?? 0) !== 1) throw new Error("Funding not found");
    await this.sql.query(
      `insert into kernel.audit_records(action,subject_type,subject_id,previous_state,new_state,correlation_id,actor_id)
       values('root.delete','funding_transaction',$1,$2::jsonb,null,$3::uuid,
              (select id from identity_capability.accounts where uuid=$4))`,
      [id, JSON.stringify({ ...previous, reversals, linkedDebt }), newId(), actorId],
    );
    await this.outbox?.append(
      proofObjects.map((proof) => ({
        id: newId(),
        name: FUNDING_PROOF_CLEANUP_EVENT,
        aggregateId: id,
        correlationId: newId(),
        occurredAt: new Date(),
        payload: {
          fundingId: id,
          storageProvider: proof.provider,
          container: proof.container,
          key: proof.key,
        },
      })),
    );
    return { id, deleted: true as const };
  }
}
