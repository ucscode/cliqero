import type {
  ListingReview,
  ListingReviewRepository,
  RatingSummary,
  ReviewStatus,
} from "@/modules/listing-review/review";
import type { SqlExecutor } from "./database";

type ReviewRow = {
  id: string;
  listing_id: string;
  account_id: string;
  rating: number;
  body: string;
  status: ReviewStatus;
  created_at: Date;
  updated_at: Date;
  moderated_at: Date | null;
  moderated_by: string | null;
  reviewer?: string;
  listing_title?: string;
};

export class PostgresListingReviewRepository implements ListingReviewRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async findMine(listingId: string, accountId: string) {
    const row = (
      await this.sql.query<ReviewRow>(
        `select id,listing_id,account_id,rating,body,status,created_at,updated_at,moderated_at,moderated_by
         from listing_capability.reviews where listing_id=$1 and account_id=$2`,
        [listingId, accountId],
      )
    ).rows[0];
    return row ? this.review(row) : null;
  }
  async savePending(input: {
    id: string;
    listingId: string;
    accountId: string;
    rating: number;
    body: string;
  }) {
    const row = (
      await this.sql.query<ReviewRow>(
        `insert into listing_capability.reviews(id,listing_id,account_id,rating,body,status)
         values($1,$2,$3,$4,$5,'pending')
         on conflict(listing_id,account_id) do update set rating=excluded.rating,body=excluded.body,
           status='pending',moderated_at=null,moderated_by=null,updated_at=now()
         returning id,listing_id,account_id,rating,body,status,created_at,updated_at,moderated_at,moderated_by`,
        [input.id, input.listingId, input.accountId, input.rating, input.body],
      )
    ).rows[0]!;
    return this.review(row);
  }
  async moderate(id: string, status: "approved" | "rejected", moderatorId: string) {
    const row = (
      await this.sql.query<ReviewRow>(
        `update listing_capability.reviews set status=$2,moderated_at=now(),moderated_by=$3,updated_at=now()
         where id=$1 returning id,listing_id,account_id,rating,body,status,created_at,updated_at,moderated_at,moderated_by`,
        [id, status, moderatorId],
      )
    ).rows[0];
    return row ? this.review(row) : null;
  }
  async queryPublic(input: { listingId: string; cursor?: string; limit: number }) {
    const values: unknown[] = [input.listingId];
    const cursor = input.cursor
      ? ` and (r.created_at,r.id)<(select created_at,id from listing_capability.reviews where id=$2)`
      : "";
    if (input.cursor) values.push(input.cursor);
    values.push(input.limit + 1);
    const rows = (
      await this.sql.query<ReviewRow>(
        `select r.id,r.listing_id,r.account_id,r.rating,r.body,r.status,r.created_at,r.updated_at,r.moderated_at,r.moderated_by,
                a.handle as reviewer
         from listing_capability.reviews r join identity_capability.accounts a on a.id=r.account_id
         where r.listing_id=$1 and r.status='approved'${cursor}
         order by r.created_at desc,r.id desc limit $${values.length}`,
        values,
      )
    ).rows;
    const visible = rows.slice(0, input.limit);
    return {
      items: visible.map((row) => ({ ...this.review(row), reviewer: row.reviewer! })),
      nextCursor: rows.length > input.limit ? visible.at(-1)!.id : null,
    };
  }
  async queryOperator(input: { status?: ReviewStatus; cursor?: string; limit: number }) {
    const values: unknown[] = [];
    const where: string[] = [];
    if (input.status) {
      values.push(input.status);
      where.push(`r.status=$${values.length}`);
    }
    if (input.cursor) {
      values.push(input.cursor);
      where.push(
        `(r.created_at,r.id)>(select created_at,id from listing_capability.reviews where id=$${values.length})`,
      );
    }
    values.push(input.limit + 1);
    const rows = (
      await this.sql.query<ReviewRow>(
        `select r.id,r.listing_id,r.account_id,r.rating,r.body,r.status,r.created_at,r.updated_at,r.moderated_at,r.moderated_by,
                a.handle as reviewer,l.title as listing_title
         from listing_capability.reviews r join identity_capability.accounts a on a.id=r.account_id
         join listing_capability.listings l on l.id=r.listing_id ${where.length ? `where ${where.join(" and ")}` : ""}
         order by r.created_at asc,r.id asc limit $${values.length}`,
        values,
      )
    ).rows;
    const visible = rows.slice(0, input.limit);
    return {
      items: visible.map((row) => ({
        ...this.review(row),
        reviewer: row.reviewer!,
        listingTitle: row.listing_title!,
      })),
      nextCursor: rows.length > input.limit ? visible.at(-1)!.id : null,
    };
  }
  async summariesForListings(listingIds: readonly string[]) {
    if (!listingIds.length) return new Map<string, RatingSummary>();
    const rows = (
      await this.sql.query<{ listing_id: string; average: string; count: string }>(
        `select listing_id,round(avg(rating)::numeric,2)::text as average,count(*)::text as count
         from listing_capability.reviews where status='approved' and listing_id=any($1::uuid[]) group by listing_id`,
        [listingIds],
      )
    ).rows;
    return new Map(
      rows.map((row) => [
        row.listing_id,
        { average: Number(row.average), count: Number(row.count) },
      ]),
    );
  }
  private review(row: ReviewRow): ListingReview {
    return {
      id: row.id,
      listingId: row.listing_id,
      accountId: row.account_id,
      rating: row.rating,
      body: row.body,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      moderatedAt: row.moderated_at,
      moderatedBy: row.moderated_by,
    };
  }
}
