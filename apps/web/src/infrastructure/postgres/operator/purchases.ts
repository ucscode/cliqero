import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type {
  OperatorPurchaseQuery,
  OperatorPurchaseReader,
} from "@/application/operator/purchases";
import { PublicApplicationError } from "@/kernel/errors";

type PurchaseRow = Record<string, any>;

function decodeCursor(value?: string) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof parsed.createdAt !== "string" ||
      typeof parsed.id !== "string" ||
      !/^\d+$/.test(parsed.id) ||
      parsed.sort !== "created" ||
      !["asc", "desc"].includes(parsed.direction)
    )
      throw new Error();
    return parsed as { createdAt: string; id: string; sort: "created"; direction: "asc" | "desc" };
  } catch {
    throw new PublicApplicationError("Invalid purchase cursor.", "invalid_cursor", 400);
  }
}

function encodeCursor(row: PurchaseRow, query: OperatorPurchaseQuery) {
  return Buffer.from(
    JSON.stringify({
      // Keep PostgreSQL's full timestamp precision. Converting through Date
      // truncates microseconds and can skip rows sharing the cursor millisecond.
      createdAt: String(row.created_at),
      id: String(row.cursor_id),
      sort: query.sort,
      direction: query.direction,
    }),
  ).toString("base64url");
}

/** PostgreSQL read model for operator purchase inspection. */
export class PostgresOperatorPurchaseReader implements OperatorPurchaseReader {
  constructor(private readonly sql: QueryExecutor) {}

  async list(query: OperatorPurchaseQuery) {
    const cursor = decodeCursor(query.cursor);
    if (cursor && (cursor.sort !== query.sort || cursor.direction !== query.direction))
      throw new PublicApplicationError(
        "Purchase cursor does not match the selected ordering.",
        "invalid_cursor",
        400,
      );
    const rows = (
      await this.sql.query<PurchaseRow>(
        `select p.uuid id,p.id cursor_id,p.state,p.price_minor_snapshot amount_minor,
              p.price_currency_snapshot currency,p.created_at::text created_at,p.updated_at,
              buyer.uuid buyer_id,buyer.username buyer_username,buyer.email buyer_email,
              listing.uuid listing_id,p.listing_title_snapshot listing_title,
              payment.uuid payment_id,payment.provider_name provider,payment.provider_reference provider_reference,
              payment.provider_transaction_id,
              checkout.uuid checkout_id,checkout.state checkout_state,
              d.uuid distribution_id,d.gross_minor distribution_amount_minor,d.currency distribution_currency,d.completed_at distribution_completed_at
         from purchase_capability.purchases p
         join identity_capability.account_profiles buyer on buyer.id=p.buyer_id
         join listing_capability.listings listing on listing.id=p.listing_id
         left join payment_capability.payments payment on payment.id=p.payment_id
         left join checkout_capability.checkouts checkout on checkout.id=p.checkout_id
         left join ledger_capability.purchase_distributions d on d.purchase_id=p.id
        where ($1::uuid is null or buyer.uuid=$1)
          and ($2::uuid is null or listing.uuid=$2)
          and ($3::text is null or p.state=$3)
          and ($4::timestamptz is null or (p.created_at,p.id) ${query.direction === "asc" ? ">" : "<"} ($4::timestamptz,$5::bigint))
        order by p.created_at ${query.direction},p.id ${query.direction} limit $6`,
        [
          query.buyer ?? null,
          query.listing ?? null,
          query.state ?? null,
          cursor?.createdAt ?? null,
          cursor?.id ?? null,
          query.limit + 1,
        ],
      )
    ).rows;
    const visible = rows.slice(0, query.limit);
    return {
      items: visible.map((row) => this.project(row)),
      nextCursor: rows.length > query.limit ? encodeCursor(visible.at(-1)!, query) : null,
    };
  }

  async get(purchaseId: string) {
    const purchase = (
      await this.sql.query<PurchaseRow>(
        `select p.uuid id,p.state,p.price_minor_snapshot amount_minor,p.price_currency_snapshot currency,
              p.canonical_minor_snapshot canonical_amount_minor,p.canonical_currency_snapshot canonical_currency,
              p.listing_title_snapshot,p.listing_short_description_snapshot,p.listing_long_description_snapshot,
              p.created_at,p.updated_at,p.payment_id,p.checkout_id,
              buyer.uuid buyer_id,buyer.username buyer_username,buyer.email buyer_email,
              listing.uuid listing_id,p.listing_title_snapshot listing_title,
              payment.uuid payment_uuid,payment.provider_name provider,payment.provider_reference provider_reference,
              payment.provider_transaction_id,payment.state payment_state,
              checkout.uuid checkout_uuid,checkout.state checkout_state,checkout.paid_at,
              d.uuid distribution_id,d.gross_minor distribution_amount_minor,d.currency distribution_currency,d.completed_at distribution_completed_at,
              (select count(*)::int from ledger_capability.entries e where e.purchase_id=p.id) ledger_entry_count
         from purchase_capability.purchases p
         join identity_capability.account_profiles buyer on buyer.id=p.buyer_id
         join listing_capability.listings listing on listing.id=p.listing_id
         left join payment_capability.payments payment on payment.id=p.payment_id
         left join checkout_capability.checkouts checkout on checkout.id=p.checkout_id
         left join ledger_capability.purchase_distributions d on d.purchase_id=p.id
        where p.uuid=$1 limit 1`,
        [purchaseId],
      )
    ).rows[0];
    if (!purchase) return null;
    return {
      ...this.project(purchase),
      canonical_amount_minor: String(purchase.canonical_amount_minor),
      canonical_currency: purchase.canonical_currency,
      listing_snapshot: {
        title: purchase.listing_title_snapshot,
        short_description: purchase.listing_short_description_snapshot,
        long_description: purchase.listing_long_description_snapshot,
      },
      payment: purchase.payment_uuid
        ? {
            id: purchase.payment_uuid,
            provider: purchase.provider,
            reference: purchase.provider_reference,
            provider_transaction_id: purchase.provider_transaction_id,
            state: purchase.payment_state,
          }
        : null,
      checkout: purchase.checkout_uuid
        ? { id: purchase.checkout_uuid, state: purchase.checkout_state, paid_at: purchase.paid_at }
        : null,
      distribution: purchase.distribution_id
        ? {
            id: purchase.distribution_id,
            amount_minor: String(purchase.distribution_amount_minor),
            currency: purchase.distribution_currency,
            completed_at: purchase.distribution_completed_at,
            ledger_entry_count: purchase.ledger_entry_count,
          }
        : null,
    };
  }

  private project(row: PurchaseRow) {
    return {
      id: row.id,
      state: row.state,
      amount_minor: String(row.amount_minor),
      currency: row.currency,
      buyer: { id: row.buyer_id, username: row.buyer_username, email: row.buyer_email ?? null },
      listing: { id: row.listing_id, title: row.listing_title },
      payment_reference: row.provider_reference ?? null,
      provider: row.provider ?? null,
      provider_transaction_id: row.provider_transaction_id ?? null,
      checkout_id: row.checkout_id ?? row.checkout_uuid ?? null,
      checkout_state: row.checkout_state ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at ?? row.created_at,
      distribution: row.distribution_id
        ? {
            id: row.distribution_id,
            amount_minor: String(row.distribution_amount_minor),
            currency: row.distribution_currency,
            completed_at: row.distribution_completed_at,
          }
        : null,
    };
  }
}
