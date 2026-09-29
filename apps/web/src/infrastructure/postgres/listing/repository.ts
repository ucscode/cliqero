import { Money } from "@/modules/money/money";
import {
  Listing,
  type ListingCategorySummary,
  type ListingMetadata,
  type ListingRepository,
  type ListingState,
  type ListingVisibility,
} from "@/modules/listing";
import type { QueryExecutor } from "../shared/database";
import type { UnitOfWork } from "@/kernel/unit-of-work";

interface ListingRow {
  id: string;
  seller_id: string;
  title: string;
  short_description: string;
  long_description: string;
  price_minor: string;
  price_currency: string;
  compare_at_price_minor: string | null;
  visibility: ListingVisibility;
  destination_url: string;
  metadata: ListingMetadata;
  state: ListingState;
  external_key: string | null;
  featured_position: number | null;
  categories: ListingCategorySummary[] | string;
}

export class PostgresListingRepository implements ListingRepository {
  constructor(
    private readonly sql: QueryExecutor,
    private readonly uow?: UnitOfWork,
  ) {}
  async findById(id: string): Promise<Listing | null> {
    const row = (
      await this.sql.query<ListingRow>(`${this.selectListings()} where l.uuid = $1`, [id])
    ).rows[0];
    return row ? this.restore(row) : null;
  }
  async findByExternalKey(sellerId: string, key: string) {
    const row = (
      await this.sql.query<ListingRow>(
        `${this.selectListings()} where l.seller_id=(select id from identity_capability.accounts where uuid=$1) and l.external_key=$2`,
        [sellerId, key],
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
    visibility?: ListingVisibility | "all";
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
    if (input.publicOnly) where.push(`l.state='published'`);
    else if (input.state) where.push(`state=${add(input.state)}`);
    if (input.visibility === "public") where.push("l.visibility='public'");
    else if (input.visibility === "authenticated") where.push("l.visibility='authenticated'");
    if (input.search)
      where.push(
        `to_tsvector('simple',title||' '||short_description||' '||long_description) @@ plainto_tsquery('simple',${add(input.search)})`,
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
        `${this.selectListings()} ${where.length ? `where ${where.join(" and ")}` : ""} order by ${order.order} limit $${values.length}`,
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
    const persist = async () => {
      await this.sql.query(
        `insert into listing_capability.listings
        (uuid, seller_id, title, short_description, long_description, price_minor, price_currency, compare_at_price_minor, visibility, destination_url, metadata, state, external_key, featured_position)
       values ($1,(select id from identity_capability.accounts where uuid=$2),$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)
       on conflict (uuid) do update set title=excluded.title, short_description=excluded.short_description, long_description=excluded.long_description,
         price_minor=excluded.price_minor, price_currency=excluded.price_currency, compare_at_price_minor=excluded.compare_at_price_minor,
         visibility=excluded.visibility, destination_url=excluded.destination_url, metadata=excluded.metadata, state=excluded.state, external_key=excluded.external_key, featured_position=excluded.featured_position, updated_at=now()`,
        [
          listing.id,
          listing.sellerId,
          listing.title,
          listing.shortDescription,
          listing.longDescription,
          listing.price.minorAmount.toString(),
          listing.price.currency,
          listing.compareAtPrice?.minorAmount.toString() ?? null,
          listing.visibility,
          listing.destination,
          JSON.stringify(listing.metadata),
          listing.state,
          listing.externalKey,
          listing.featuredPosition,
        ],
      );
      await this.sql.query(
        "delete from listing_capability.listing_categories where listing_id=(select id from listing_capability.listings where uuid=$1)",
        [listing.id],
      );
      if (listing.categories.length) {
        const inserted = await this.sql.query(
          `insert into listing_capability.listing_categories(listing_id,category_id)
           select l.id,c.id from listing_capability.listings l
           cross join unnest($2::uuid[]) assigned(category_uuid)
           join listing_capability.categories c on c.uuid=assigned.category_uuid
           where l.uuid=$1`,
          [listing.id, listing.categories.map((category) => category.id)],
        );
        if (inserted.rowCount !== listing.categories.length)
          throw new Error("One or more catalogue categories are no longer available");
      }
    };
    if (this.uow) await this.uow.transaction(persist);
    else await persist();
  }
  private restore(row: ListingRow) {
    return Listing.restore({
      id: row.id,
      sellerId: row.seller_id,
      title: row.title,
      shortDescription: row.short_description,
      longDescription: row.long_description,
      price: Money.of(BigInt(row.price_minor), row.price_currency),
      compareAtPrice:
        row.compare_at_price_minor === null
          ? null
          : Money.of(BigInt(row.compare_at_price_minor), row.price_currency),
      visibility: row.visibility,
      categories: typeof row.categories === "string" ? JSON.parse(row.categories) : row.categories,
      destination: row.destination_url,
      metadata: row.metadata,
      state: row.state,
      externalKey: row.external_key,
      featuredPosition: row.featured_position,
    });
  }

  private selectListings() {
    return `select l.uuid as id,seller.uuid as seller_id,l.title,l.short_description,l.long_description,
      l.price_minor,l.price_currency,l.compare_at_price_minor,l.visibility,l.destination_url,l.metadata,l.state,
      l.external_key,l.featured_position,coalesce(category_data.categories,'[]'::json) as categories
      from listing_capability.listings l
      join identity_capability.accounts seller on seller.id=l.seller_id
      left join lateral (
        select json_agg(json_build_object('id',c.uuid,'name',c.name,'slug',c.slug) order by lower(c.name) collate "C",c.id) as categories
        from listing_capability.listing_categories lc
        join listing_capability.categories c on c.id=lc.category_id
        where lc.listing_id=l.id
      ) category_data on true`;
  }
}
