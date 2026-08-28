import { Money } from "@/modules/money/money";
import { Account, type AccountReader } from "@/modules/identity/account";
import { Listing, type ListingMetadata, type ListingRepository, type ListingState } from "@/modules/listing/listing";
import { Purchase, type PurchaseRepository, type PurchaseState } from "@/modules/purchase/purchase";
import { Entitlement, type EntitlementRepository, type EntitlementState } from "@/modules/entitlement/entitlement";
import { AccessGrant, type AccessGrantRepository, type AccessGrantState } from "@/modules/access/access";
import type { SqlExecutor } from "./database";

interface AccountRow { id: string; email: string; handle: string; }
export class PostgresAccountRepository implements AccountReader {
  constructor(private readonly sql: SqlExecutor) {}
  async exists(id: string): Promise<boolean> {
    return (await this.sql.query("select 1 from identity_capability.accounts where id = $1", [id])).rowCount === 1;
  }
  async findById(id: string): Promise<Account | null> {
    const row = (await this.sql.query<AccountRow>("select id, email, handle from identity_capability.accounts where id = $1", [id])).rows[0];
    return row ? new Account(row.id, row.email, row.handle) : null;
  }
}

interface ListingRow {
  id: string; seller_id: string; title: string; description: string; price_minor: string;
  price_currency: string; destination_url: string; metadata: ListingMetadata; state: ListingState;
}
export class PostgresListingRepository implements ListingRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async findById(id: string): Promise<Listing | null> {
    const row = (await this.sql.query<ListingRow>(
      `select id, seller_id, title, description, price_minor, price_currency, destination_url, metadata, state
       from listing_capability.listings where id = $1`, [id],
    )).rows[0];
    return row ? Listing.restore({
      id: row.id, sellerId: row.seller_id, title: row.title, description: row.description,
      price: Money.of(BigInt(row.price_minor), row.price_currency), destination: row.destination_url,
      metadata: row.metadata, state: row.state,
    }) : null;
  }
  async save(listing: Listing): Promise<void> {
    await this.sql.query(
      `insert into listing_capability.listings
        (id, seller_id, title, description, price_minor, price_currency, destination_url, metadata, state)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       on conflict (id) do update set title=excluded.title, description=excluded.description,
         price_minor=excluded.price_minor, price_currency=excluded.price_currency,
         destination_url=excluded.destination_url, metadata=excluded.metadata, state=excluded.state, updated_at=now()`,
      [listing.id, listing.sellerId, listing.title, listing.description, listing.price.minorAmount.toString(),
       listing.price.currency, listing.destination, JSON.stringify(listing.metadata), listing.state],
    );
  }
}

interface PurchaseRow {
  id: string; buyer_id: string; seller_id: string; listing_id: string; payment_id: string; idempotency_key: string;
  listing_title_snapshot: string; price_minor_snapshot: string; price_currency_snapshot: string;
  canonical_minor_snapshot: string; canonical_currency_snapshot: "USD"; referral_attribution_id: string | null; state: PurchaseState;
  referral_link_id:string|null;referral_referrer_account_id:string|null;
}
export class PostgresPurchaseRepository implements PurchaseRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async findById(id: string, options?: { forUpdate?: boolean }): Promise<Purchase | null> {
    const lock = options?.forUpdate ? " for update" : "";
    const row = (await this.sql.query<PurchaseRow>(
      `select id,buyer_id,seller_id,listing_id,payment_id,idempotency_key,listing_title_snapshot,
              price_minor_snapshot,price_currency_snapshot,canonical_minor_snapshot,canonical_currency_snapshot,
              referral_attribution_id,referral_link_id,referral_referrer_account_id,state from purchase_capability.purchases where id=$1${lock}`, [id],
    )).rows[0];
    return row ? this.restore(row) : null;
  }
  async findByIdempotencyKey(key: string): Promise<Purchase | null> {
    const row = (await this.sql.query<PurchaseRow>(
      `select id,buyer_id,seller_id,listing_id,payment_id,idempotency_key,listing_title_snapshot,
              price_minor_snapshot,price_currency_snapshot,canonical_minor_snapshot,canonical_currency_snapshot,
              referral_attribution_id,referral_link_id,referral_referrer_account_id,state from purchase_capability.purchases where idempotency_key=$1`, [key],
    )).rows[0];
    return row ? this.restore(row) : null;
  }
  async save(purchase: Purchase): Promise<void> {
    await this.sql.query(
      `insert into purchase_capability.purchases
        (id,buyer_id,seller_id,listing_id,payment_id,idempotency_key,listing_title_snapshot,
         price_minor_snapshot,price_currency_snapshot,canonical_minor_snapshot,canonical_currency_snapshot,
         referral_attribution_id,referral_link_id,referral_referrer_account_id,state)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict (id) do update set state=excluded.state, updated_at=now()`,
      [purchase.id,purchase.buyerId,purchase.terms.sellerId,purchase.terms.listingId,purchase.paymentId,
       purchase.idempotencyKey,purchase.terms.title,purchase.terms.price.minorAmount,purchase.terms.price.currency,
       purchase.terms.canonicalPrice.minorAmount,purchase.terms.canonicalPrice.currency,
       purchase.terms.referralAttributionId,purchase.terms.referralLinkId,purchase.terms.referralReferrerAccountId,purchase.state],
    );
  }
  private restore(row: PurchaseRow): Purchase {
    return Purchase.restore({ id:row.id,buyerId:row.buyer_id,paymentId:row.payment_id,idempotencyKey:row.idempotency_key,state:row.state,
      terms:{ listingId:row.listing_id,sellerId:row.seller_id,title:row.listing_title_snapshot,
        price:{minorAmount:row.price_minor_snapshot,currency:row.price_currency_snapshot},
        canonicalPrice:{minorAmount:row.canonical_minor_snapshot,currency:row.canonical_currency_snapshot},
        referralAttributionId:row.referral_attribution_id,referralLinkId:row.referral_link_id,
        referralReferrerAccountId:row.referral_referrer_account_id } });
  }
}

interface EntitlementRow { id:string; buyer_id:string; listing_id:string; purchase_id:string; state:EntitlementState; }
export class PostgresEntitlementRepository implements EntitlementRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async findByPurchaseId(purchaseId:string) { return this.find("purchase_id = $1", [purchaseId]); }
  async findActive(buyerId:string, listingId:string) { return this.find("buyer_id = $1 and listing_id = $2 and state = 'active'", [buyerId,listingId]); }
  async findById(id:string) { return this.find("id = $1", [id]); }
  async save(entitlement:Entitlement):Promise<void> {
    await this.sql.query(
      `insert into entitlement_capability.entitlements (id,buyer_id,listing_id,purchase_id,state)
       values ($1,$2,$3,$4,$5) on conflict (id) do update set state=excluded.state,updated_at=now()`,
      [entitlement.id,entitlement.buyerId,entitlement.listingId,entitlement.purchaseId,entitlement.state]);
  }
  private async find(where:string, values:readonly unknown[]):Promise<Entitlement|null> {
    const row=(await this.sql.query<EntitlementRow>(`select id,buyer_id,listing_id,purchase_id,state from entitlement_capability.entitlements where ${where} limit 1`,values)).rows[0];
    return row ? Entitlement.restore(row.id,row.buyer_id,row.listing_id,row.purchase_id,row.state) : null;
  }
}

interface GrantRow { id:string; entitlement_id:string; token_hash:Buffer; state:AccessGrantState; }
export class PostgresAccessGrantRepository implements AccessGrantRepository {
  constructor(private readonly sql:SqlExecutor) {}
  async findByTokenHash(tokenHash:Buffer):Promise<AccessGrant|null> {
    const row=(await this.sql.query<GrantRow>(
      `select id,entitlement_id,token_hash,state from access_capability.access_grants where token_hash=$1`,[tokenHash])).rows[0];
    return row ? AccessGrant.restore(row.id,row.entitlement_id,row.token_hash,row.state) : null;
  }
  async save(grant:AccessGrant,idempotencyKey?:string):Promise<void> {
    await this.sql.query(
      `insert into access_capability.access_grants (id,entitlement_id,token_hash,state,idempotency_key)
       values ($1,$2,$3,$4,$5)`,[grant.id,grant.entitlementId,grant.tokenHash,grant.state,idempotencyKey??null]);
  }
}
