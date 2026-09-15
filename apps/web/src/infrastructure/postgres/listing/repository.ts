import { Money } from "@/modules/money/money";
import {
  Listing,
  type ListingMetadata,
  type ListingRepository,
  type ListingState,
} from "@/modules/listing";
import type { SqlExecutor } from "../shared/database";

interface ListingRow {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price_minor: string;
  price_currency: string;
  destination_url: string;
  metadata: ListingMetadata;
  state: ListingState;
  external_key: string | null;
  featured_position: number | null;
}

export class PostgresListingRepository implements ListingRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async findById(id: string): Promise<Listing | null> {
    const row = (
      await this.sql.query<ListingRow>(
        `select l.uuid as id, seller.uuid as seller_id, l.title, l.description, l.price_minor, l.price_currency, l.destination_url, l.metadata, l.state, l.external_key, l.featured_position
       from listing_capability.listings l join identity_capability.accounts seller on seller.id=l.seller_id where l.uuid = $1`,
        [id],
      )
    ).rows[0];
    return row
      ? Listing.restore({
          id: row.id,
          sellerId: row.seller_id,
          title: row.title,
          description: row.description,
          price: Money.of(BigInt(row.price_minor), row.price_currency),
          destination: row.destination_url,
          metadata: row.metadata,
          state: row.state,
          externalKey: row.external_key,
        })
      : null;
  }
  async findByExternalKey(sellerId: string, key: string) {
    const row = (
      await this.sql.query<ListingRow>(
        `select l.uuid as id,seller.uuid as seller_id,l.title,l.description,l.price_minor,l.price_currency,l.destination_url,l.metadata,l.state,l.external_key,l.featured_position from listing_capability.listings l join identity_capability.accounts seller on seller.id=l.seller_id where l.seller_id=(select id from identity_capability.accounts where uuid=$1) and l.external_key=$2`,
        [sellerId, key],
      )
    ).rows[0];
    return row ? this.restore(row) : null;
  }
  async findAnyByExternalKey(key: string) {
    const row = (
      await this.sql.query<ListingRow>(
        `select l.uuid as id,seller.uuid as seller_id,l.title,l.description,l.price_minor,l.price_currency,l.destination_url,l.metadata,l.state,l.external_key,l.featured_position from listing_capability.listings l join identity_capability.accounts seller on seller.id=l.seller_id where l.external_key=$1`,
        [key],
      )
    ).rows[0];
    return row ? this.restore(row) : null;
  }
  async query(input: {
    sellerId?: string;
    publicOnly?: boolean;
    state?: ListingState;
    search?: string;
    cursor?: string;
    sort?: import("@/modules/listing").ListingSort;
    featuredOnly?: boolean;
    limit: number;
  }) {
    const values: unknown[] = [];
    const where: string[] = [];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (input.sellerId)
      where.push(
        `seller_id=(select id from identity_capability.accounts where uuid=${add(input.sellerId)})`,
      );
    if (input.publicOnly) where.push(`state='published'`);
    else if (input.state) where.push(`state=${add(input.state)}`);
    if (input.search)
      where.push(
        `to_tsvector('simple',title||' '||description) @@ plainto_tsquery('simple',${add(input.search)})`,
      );
    if (input.featuredOnly) where.push("featured_position is not null");
    const sort = input.featuredOnly ? "featured" : (input.sort ?? "newest");
    const ordering: Record<string, { order: string; after: string }> = {
      newest: {
        order: "l.created_at desc,l.id desc",
        after:
          "(l.created_at,l.id)<(select cursor_listing.created_at,cursor_listing.id from listing_capability.listings cursor_listing where cursor_listing.uuid=",
      },
      oldest: {
        order: "l.created_at asc,l.id asc",
        after:
          "(l.created_at,l.id)>(select cursor_listing.created_at,cursor_listing.id from listing_capability.listings cursor_listing where cursor_listing.uuid=",
      },
      price_asc: {
        order: "l.price_minor asc,l.id asc",
        after:
          "(l.price_minor,l.id)>(select cursor_listing.price_minor,cursor_listing.id from listing_capability.listings cursor_listing where cursor_listing.uuid=",
      },
      price_desc: {
        order: "l.price_minor desc,l.id desc",
        after:
          "(l.price_minor,l.id)<(select cursor_listing.price_minor,cursor_listing.id from listing_capability.listings cursor_listing where cursor_listing.uuid=",
      },
      title_asc: {
        order: "lower(l.title) asc,l.id asc",
        after:
          "(lower(l.title),l.id)>(select lower(cursor_listing.title),cursor_listing.id from listing_capability.listings cursor_listing where cursor_listing.uuid=",
      },
      featured: {
        order: "l.featured_position asc,l.id asc",
        after:
          "(l.featured_position,l.id)>(select cursor_listing.featured_position,cursor_listing.id from listing_capability.listings cursor_listing where cursor_listing.uuid=",
      },
    };
    const order = ordering[sort] ?? ordering.newest;
    if (input.cursor) where.push(`${order.after}${add(input.cursor)})`);
    values.push(input.limit + 1);
    const rows = (
      await this.sql.query<ListingRow>(
        `select l.uuid as id,seller.uuid as seller_id,l.title,l.description,l.price_minor,l.price_currency,l.destination_url,l.metadata,l.state,l.external_key,l.featured_position from listing_capability.listings l join identity_capability.accounts seller on seller.id=l.seller_id ${where.length ? `where ${where.join(" and ")}` : ""} order by ${order.order} limit $${values.length}`,
        values,
      )
    ).rows;
    const visible = rows.slice(0, input.limit);
    return {
      items: visible.map((row) => this.restore(row)),
      nextCursor: rows.length > input.limit ? visible.at(-1)!.id : null,
    };
  }
  async save(listing: Listing): Promise<void> {
    await this.sql.query(
      `insert into listing_capability.listings
        (uuid, seller_id, title, description, price_minor, price_currency, destination_url, metadata, state, external_key, featured_position)
       values ($1,(select id from identity_capability.accounts where uuid=$2),$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
       on conflict (uuid) do update set title=excluded.title, description=excluded.description,
         price_minor=excluded.price_minor, price_currency=excluded.price_currency,
         destination_url=excluded.destination_url, metadata=excluded.metadata, state=excluded.state, external_key=excluded.external_key, featured_position=excluded.featured_position, updated_at=now()`,
      [
        listing.id,
        listing.sellerId,
        listing.title,
        listing.description,
        listing.price.minorAmount.toString(),
        listing.price.currency,
        listing.destination,
        JSON.stringify(listing.metadata),
        listing.state,
        listing.externalKey,
        listing.featuredPosition,
      ],
    );
  }
  private restore(row: ListingRow) {
    return Listing.restore({
      id: row.id,
      sellerId: row.seller_id,
      title: row.title,
      description: row.description,
      price: Money.of(BigInt(row.price_minor), row.price_currency),
      destination: row.destination_url,
      metadata: row.metadata,
      state: row.state,
      externalKey: row.external_key,
      featuredPosition: row.featured_position,
    });
  }
}
