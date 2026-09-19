import { Purchase, type PurchaseRepository, type PurchaseState } from "@/modules/purchase/purchase";
import type { QueryExecutor } from "../shared/database";

interface PurchaseRow {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  payment_id: string | null;
  checkout_id: string | null;
  idempotency_key: string;
  listing_title_snapshot: string;
  listing_short_description_snapshot: string;
  listing_long_description_snapshot: string;
  price_minor_snapshot: string;
  price_currency_snapshot: string;
  canonical_minor_snapshot: string;
  canonical_currency_snapshot: "USD";
  referral_attribution_id: string | null;
  state: PurchaseState;
  referral_referrer_account_id: string | null;
}

export class PostgresPurchaseRepository implements PurchaseRepository {
  constructor(private readonly sql: QueryExecutor) {}
  async findById(id: string, options?: { forUpdate?: boolean }): Promise<Purchase | null> {
    const lock = options?.forUpdate ? " for update" : "";
    const row = (
      await this.sql.query<PurchaseRow>(
        `select p.uuid as id,
              (select uuid from identity_capability.accounts where id=p.buyer_id) as buyer_id,
              (select uuid from identity_capability.accounts where id=p.seller_id) as seller_id,
              (select uuid from listing_capability.listings where id=p.listing_id) as listing_id,
              (select uuid from payment_capability.payments where id=p.payment_id) as payment_id,
              (select uuid from checkout_capability.checkouts where id=p.checkout_id) as checkout_id,
              p.idempotency_key,p.listing_title_snapshot,p.listing_short_description_snapshot,p.listing_long_description_snapshot,p.price_minor_snapshot,p.price_currency_snapshot,
              p.canonical_minor_snapshot,p.canonical_currency_snapshot,
              (select uuid from referral_capability.listing_attributions where id=p.referral_attribution_id) as referral_attribution_id,
              (select uuid from identity_capability.accounts where id=p.referral_referrer_account_id) as referral_referrer_account_id,
              p.state from purchase_capability.purchases p where p.uuid=$1${lock}`,
        [id],
      )
    ).rows[0];
    return row ? this.restore(row) : null;
  }
  async findByIdempotencyKey(key: string): Promise<Purchase | null> {
    const row = (
      await this.sql.query<PurchaseRow>(
        `select p.uuid as id,
              (select uuid from identity_capability.accounts where id=p.buyer_id) as buyer_id,
              (select uuid from identity_capability.accounts where id=p.seller_id) as seller_id,
              (select uuid from listing_capability.listings where id=p.listing_id) as listing_id,
              (select uuid from payment_capability.payments where id=p.payment_id) as payment_id,
              (select uuid from checkout_capability.checkouts where id=p.checkout_id) as checkout_id,
              p.idempotency_key,p.listing_title_snapshot,p.listing_short_description_snapshot,p.listing_long_description_snapshot,p.price_minor_snapshot,p.price_currency_snapshot,
              p.canonical_minor_snapshot,p.canonical_currency_snapshot,
              (select uuid from referral_capability.listing_attributions where id=p.referral_attribution_id) as referral_attribution_id,
              (select uuid from identity_capability.accounts where id=p.referral_referrer_account_id) as referral_referrer_account_id,
              p.state from purchase_capability.purchases p where p.idempotency_key=$1`,
        [key],
      )
    ).rows[0];
    return row ? this.restore(row) : null;
  }
  async findCompletedWithoutEntitlement(limit = 50): Promise<readonly Purchase[]> {
    const rows = (
      await this.sql.query<{ id: string }>(
        `select p.uuid as id from purchase_capability.purchases p left join entitlement_capability.entitlements e on e.purchase_id=p.id where p.state in ('paid','completed') and e.id is null order by p.updated_at,p.id limit $1`,
        [limit],
      )
    ).rows;
    return (await Promise.all(rows.map((r) => this.findById(r.id)))).filter(
      (v): v is Purchase => v !== null,
    );
  }
  async findCompletedWithoutDistribution(limit = 50): Promise<readonly Purchase[]> {
    const rows = (
      await this.sql.query<{ id: string }>(
        `select p.uuid as id from purchase_capability.purchases p left join ledger_capability.purchase_distributions d on d.purchase_id=p.id where p.state in ('paid','completed') and d.id is null order by p.updated_at,p.id limit $1`,
        [limit],
      )
    ).rows;
    return (await Promise.all(rows.map((r) => this.findById(r.id)))).filter(
      (v): v is Purchase => v !== null,
    );
  }
  async save(purchase: Purchase): Promise<void> {
    await this.sql.query(
      `insert into purchase_capability.purchases
        (uuid,buyer_id,seller_id,listing_id,payment_id,checkout_id,idempotency_key,listing_title_snapshot,
         listing_short_description_snapshot,listing_long_description_snapshot,price_minor_snapshot,price_currency_snapshot,canonical_minor_snapshot,canonical_currency_snapshot,
         referral_attribution_id,referral_referrer_account_id,state)
       values ($1,
         (select id from identity_capability.accounts where uuid=$2),
         (select id from identity_capability.accounts where uuid=$3),
         (select id from listing_capability.listings where uuid=$4),
         (select id from payment_capability.payments where uuid=$5),
         (select id from checkout_capability.checkouts where uuid=$6),
         $7,$8,$9,$10,$11,$12,$13,$14,
         (select id from referral_capability.listing_attributions where uuid=$15),
         (select id from identity_capability.accounts where uuid=$16),$17)
       on conflict (uuid) do update set state=excluded.state,checkout_id=coalesce(excluded.checkout_id,purchase_capability.purchases.checkout_id), updated_at=now()`,
      [
        purchase.id,
        purchase.buyerId,
        purchase.terms.sellerId,
        purchase.terms.listingId,
        purchase.paymentId,
        purchase.checkoutId,
        purchase.idempotencyKey,
        purchase.terms.title,
        purchase.terms.shortDescription,
        purchase.terms.longDescription,
        purchase.terms.price.minorAmount,
        purchase.terms.price.currency,
        purchase.terms.canonicalPrice.minorAmount,
        purchase.terms.canonicalPrice.currency,
        purchase.terms.referralAttributionId,
        purchase.terms.referralReferrerAccountId,
        purchase.state,
      ],
    );
  }
  private restore(row: PurchaseRow): Purchase {
    return Purchase.restore({
      id: row.id,
      buyerId: row.buyer_id,
      paymentId: row.payment_id,
      checkoutId: row.checkout_id,
      idempotencyKey: row.idempotency_key,
      state: row.state,
      terms: {
        listingId: row.listing_id,
        sellerId: row.seller_id,
        title: row.listing_title_snapshot,
        shortDescription: row.listing_short_description_snapshot,
        longDescription: row.listing_long_description_snapshot,
        price: { minorAmount: row.price_minor_snapshot, currency: row.price_currency_snapshot },
        canonicalPrice: {
          minorAmount: row.canonical_minor_snapshot,
          currency: row.canonical_currency_snapshot,
        },
        referralAttributionId: row.referral_attribution_id,
        referralReferrerAccountId: row.referral_referrer_account_id,
      },
    });
  }
}
