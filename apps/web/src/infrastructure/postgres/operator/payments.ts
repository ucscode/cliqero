import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type { OperatorPaymentFilters, OperatorPaymentReader } from "@/application/payment/operator";
import { PublicApplicationError } from "@/kernel/errors";

type Cursor = { createdAt: string; id: string };

function decodeCursor(value?: string): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    if (
      typeof parsed.createdAt !== "string" ||
      typeof parsed.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id)
    )
      throw new Error();
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.valueOf())) throw new Error();
    return { createdAt: createdAt.toISOString(), id: parsed.id };
  } catch {
    throw new PublicApplicationError("Invalid payment pagination cursor", "invalid_cursor", 400);
  }
}

function encodeCursor(createdAt: string | Date, id: string) {
  return Buffer.from(JSON.stringify({ createdAt: new Date(createdAt).toISOString(), id })).toString(
    "base64url",
  );
}

/** Read-only, provider-neutral projection for operator payment operations. */
export class PostgresOperatorPaymentReader implements OperatorPaymentReader {
  constructor(private readonly sql: QueryExecutor) {}

  async list(filters: OperatorPaymentFilters) {
    const cursor = decodeCursor(filters.cursor);
    const search = filters.search?.trim() || null;
    const escapedSearch = search?.replace(/[\\%_]/g, "\\$&") ?? null;
    const rows = (
      await this.sql.query<any>(
        `select payment.uuid id,payment.provider_name provider,payment.provider_reference reference,
                payment.provider_transaction_id,payment.state,payment.provider_amount_minor amount_minor,
                payment.provider_currency currency,payment.canonical_amount_minor canonical_amount_minor,
                payment.canonical_currency canonical_currency,payment.created_at,
                buyer.username buyer_username,listing.uuid listing_id,listing.title listing_title
           from payment_capability.payments payment
           join identity_capability.account_profiles buyer on buyer.id=payment.buyer_id
           join listing_capability.listings listing on listing.id=payment.listing_id
          where ($1::text is null or payment.provider_name=$1)
            and ($2::text is null or payment.state=$2)
            and ($3::text is null or payment.uuid::text=$3 or payment.provider_reference ilike '%'||$3||'%' escape '\\' or buyer.username ilike '%'||$3||'%' escape '\\')
            and ($4::timestamptz is null or (payment.created_at,payment.uuid)<($4::timestamptz,$5::uuid))
          order by payment.created_at desc,payment.uuid desc limit $6`,
        [
          filters.provider ?? null,
          filters.state ?? null,
          escapedSearch,
          cursor?.createdAt ?? null,
          cursor?.id ?? null,
          filters.limit + 1,
        ],
      )
    ).rows;
    const visible = rows.slice(0, filters.limit);
    return {
      items: visible.map((row) => this.project(row)),
      nextCursor:
        rows.length > filters.limit
          ? encodeCursor(visible.at(-1).created_at, visible.at(-1).id)
          : null,
    };
  }

  async get(paymentId: string) {
    const row = (
      await this.sql.query<any>(
        `select payment.uuid id,payment.provider_name provider,payment.provider_reference reference,
                payment.provider_transaction_id,payment.state,payment.provider_amount_minor amount_minor,
                payment.provider_currency currency,payment.canonical_amount_minor canonical_amount_minor,
                payment.canonical_currency canonical_currency,payment.created_at,payment.updated_at,
                payment.provider_fee_minor fee_minor,payment.provider_fee_currency fee_currency,
                payment.conversion_snapshot,
                buyer.username buyer_username,listing.uuid listing_id,listing.title listing_title
           from payment_capability.payments payment
           join identity_capability.account_profiles buyer on buyer.id=payment.buyer_id
           join listing_capability.listings listing on listing.id=payment.listing_id
          where payment.uuid=$1`,
        [paymentId],
      )
    ).rows[0];
    return row ? this.project(row, true) : null;
  }

  async listEvents(limit: number, provider?: string) {
    return (
      await this.sql.query(
        `select event.id,event.provider_name provider,event.event_type,event.provider_reference,
                event.amount_minor,event.currency,event.state,event.last_error,event.received_at,event.processed_at,
                payment.uuid payment_id,payment.state payment_state,payment.provider_transaction_id,
                outbox.state outbox_state,outbox.last_error outbox_last_error
           from payment_capability.provider_events event
           left join payment_capability.payments payment on payment.provider_name=event.provider_name and payment.provider_reference=event.provider_reference
           left join lateral (
             select event_outbox.state,event_outbox.last_error
               from kernel.outbox_events event_outbox
              where event_outbox.aggregate_id=event.id
              order by event_outbox.occurred_at desc,event_outbox.id desc limit 1
           ) outbox on true
          where ($2::text is null or event.provider_name=$2)
          order by event.received_at desc,event.id desc limit $1`,
        [limit, provider ?? null],
      )
    ).rows;
  }

  private project(row: any, detail = false) {
    const result = {
      id: row.id,
      provider: row.provider,
      reference: row.reference,
      provider_transaction_id: row.provider_transaction_id,
      state: row.state,
      amount_minor: row.amount_minor,
      currency: row.currency,
      canonical_amount_minor: row.canonical_amount_minor,
      canonical_currency: row.canonical_currency,
      buyer_username: row.buyer_username,
      listing: { id: row.listing_id, title: row.listing_title },
      created_at: row.created_at,
    };
    return detail
      ? {
          ...result,
          updated_at: row.updated_at,
          fee_minor: row.fee_minor,
          fee_currency: row.fee_currency,
          conversion_snapshot: row.conversion_snapshot,
        }
      : result;
  }
}
