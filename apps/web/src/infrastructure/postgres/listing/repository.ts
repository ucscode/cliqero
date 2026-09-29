import { Buffer } from "node:buffer";
import { PublicApplicationError } from "@/kernel/errors";
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
import { approvedReviewSummaryCte } from "./approved-review-summary";

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
  rating_average?: string | null;
  rating_count?: string;
  has_rating?: boolean;
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
    direction?: import("@/modules/listing").ListingSortDirection;
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
        `seller_pk=(select id from identity_capability.accounts where uuid=${add(input.sellerId)})`,
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
    const sort = input.featuredOnly ? "featured" : (input.sort ?? "date");
    const direction = input.featuredOnly ? "asc" : (input.direction ?? "desc");
    const cursorScope = this.cursorScope(input, sort, direction);
    let cursorId: string | undefined;
    if (input.cursor) cursorId = this.decodeCursor(input.cursor, cursorScope);
    const comparator = direction === "asc" ? ">" : "<";
    const order =
      sort === "rating"
        ? `l.has_rating desc,l.rating_average ${direction} nulls last,l.rating_count desc,l.id asc`
        : sort === "price"
          ? `l.price_minor ${direction},l.id ${direction}`
          : sort === "title"
            ? `lower(l.title) ${direction},l.id ${direction}`
            : sort === "featured"
              ? "l.featured_position asc,l.id asc"
              : `l.created_at ${direction},l.id ${direction}`;
    if (cursorId) {
      const cursorParameter = add(cursorId);
      if (sort === "rating") {
        const ratingComparator = direction === "asc" ? ">" : "<";
        where.push(`exists (
          select 1 from catalogue cursor_listing where cursor_listing.id=${cursorParameter} and (
            (not cursor_listing.has_rating and not l.has_rating and l.id>cursor_listing.id)
            or (cursor_listing.has_rating and (
              not l.has_rating
              or (l.has_rating and (
                l.rating_average ${ratingComparator} cursor_listing.rating_average
                or (l.rating_average=cursor_listing.rating_average and l.rating_count<cursor_listing.rating_count)
                or (l.rating_average=cursor_listing.rating_average and l.rating_count=cursor_listing.rating_count and l.id>cursor_listing.id)
              ))
            ))
          )
        )`);
      } else {
        const field =
          sort === "price"
            ? "price_minor"
            : sort === "title"
              ? "lower_title"
              : sort === "featured"
                ? "featured_position"
                : "created_at";
        where.push(
          `(l.${field},l.id) ${comparator} (select cursor_listing.${field},cursor_listing.id from catalogue cursor_listing where cursor_listing.id=${cursorParameter})`,
        );
      }
    }
    values.push(input.limit + 1);
    const rows = (
      await this.sql.query<ListingRow>(
        `with ${sort === "rating" ? `${approvedReviewSummaryCte},` : ""} catalogue as (
          ${this.selectListings(sort === "rating")}
        )
        select l.* from catalogue l
        ${where.length ? `where ${where.join(" and ")}` : ""} order by ${order} limit $${values.length}`,
        values,
      )
    ).rows;
    const visible = rows.slice(0, input.limit);
    return {
      items: visible.map((row) => this.restore(row)),
      nextCursor:
        rows.length > input.limit ? this.encodeCursor(visible.at(-1)!.id, cursorScope) : null,
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

  private selectListings(includeRating = false) {
    return `select l.uuid as id,seller.uuid as seller_id,l.seller_id as seller_pk,l.title,lower(l.title) as lower_title,l.created_at,l.price_minor,l.featured_position,l.short_description,l.long_description,
      l.price_currency,l.compare_at_price_minor,l.visibility,l.destination_url,l.metadata,l.state,
      l.external_key,coalesce(category_data.categories,'[]'::json) as categories
      ${includeRating ? ",review_summary.average_rating as rating_average,coalesce(review_summary.approved_count,0) as rating_count,(review_summary.listing_id is not null) as has_rating" : ""}
      from listing_capability.listings l
      join identity_capability.accounts seller on seller.id=l.seller_id
      left join lateral (
        select json_agg(json_build_object('id',c.uuid,'name',c.name,'slug',c.slug) order by lower(c.name) collate "C",c.id) as categories
        from listing_capability.listing_categories lc
        join listing_capability.categories c on c.id=lc.category_id
        where lc.listing_id=l.id
      ) category_data on true
      ${includeRating ? "left join approved_review_summary review_summary on review_summary.listing_id=l.id" : ""}`;
  }

  private cursorScope(
    input: {
      sellerId?: string;
      publicOnly?: boolean;
      state?: ListingState;
      search?: string;
      featuredOnly?: boolean;
      visibility?: ListingVisibility | "all";
    },
    sort: string,
    direction: string,
  ) {
    return JSON.stringify({
      sellerId: input.sellerId ?? null,
      publicOnly: input.publicOnly ?? false,
      state: input.state ?? null,
      search: input.search ?? null,
      featuredOnly: input.featuredOnly ?? false,
      visibility: input.visibility ?? null,
      sort,
      direction,
    });
  }

  private encodeCursor(id: string, scope: string) {
    return Buffer.from(JSON.stringify({ version: 1, id, scope })).toString("base64url");
  }

  private decodeCursor(cursor: string, scope: string) {
    try {
      const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
        version?: unknown;
        id?: unknown;
        scope?: unknown;
      };
      if (value.version === 1 && typeof value.id === "string" && value.scope === scope)
        return value.id;
    } catch {
      // Treat malformed and cross-query cursors identically as invalid input.
    }
    throw new PublicApplicationError(
      "Listing cursor does not match this catalogue query",
      "invalid_listing_cursor",
      400,
    );
  }
}
