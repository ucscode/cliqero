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
        `select r.uuid as id,(select uuid from listing_capability.listings where id=r.listing_id) as listing_id,(select uuid from identity_capability.accounts where id=r.account_id) as account_id,r.rating,r.body,r.status,r.created_at,r.updated_at,r.moderated_at,(select uuid from identity_capability.accounts where id=r.moderated_by) as moderated_by
         from listing_capability.reviews r where r.listing_id=(select id from listing_capability.listings where uuid=$1) and r.account_id=(select id from identity_capability.accounts where uuid=$2)`,
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
        `with upserted as (insert into listing_capability.reviews(uuid,listing_id,account_id,rating,body,status)
         values($1,(select id from listing_capability.listings where uuid=$2),(select id from identity_capability.accounts where uuid=$3),$4,$5,'pending')
         on conflict(listing_id,account_id) do update set rating=excluded.rating,body=excluded.body,
           status='pending',moderated_at=null,moderated_by=null,updated_at=now()
         returning *)
         select u.uuid as id,l.uuid as listing_id,a.uuid as account_id,u.rating,u.body,u.status,u.created_at,u.updated_at,u.moderated_at,moderator.uuid as moderated_by
         from upserted u join listing_capability.listings l on l.id=u.listing_id join identity_capability.accounts a on a.id=u.account_id left join identity_capability.accounts moderator on moderator.id=u.moderated_by`,
        [input.id, input.listingId, input.accountId, input.rating, input.body],
      )
    ).rows[0]!;
    return this.review(row);
  }
  async moderate(id: string, status: "approved" | "rejected", moderatorId: string) {
    const row = (
      await this.sql.query<ReviewRow>(
        `with updated as (update listing_capability.reviews set status=$2,moderated_at=now(),moderated_by=(select id from identity_capability.accounts where uuid=$3),updated_at=now()
         where uuid=$1 returning *)
         select u.uuid as id,l.uuid as listing_id,a.uuid as account_id,u.rating,u.body,u.status,u.created_at,u.updated_at,u.moderated_at,moderator.uuid as moderated_by
         from updated u join listing_capability.listings l on l.id=u.listing_id join identity_capability.accounts a on a.id=u.account_id left join identity_capability.accounts moderator on moderator.id=u.moderated_by`,
        [id, status, moderatorId],
      )
    ).rows[0];
    return row ? this.review(row) : null;
  }
  async queryPublic(input: { listingId: string; cursor?: string; limit: number }) {
    const values: unknown[] = [input.listingId];
    const cursor = input.cursor
      ? ` and (r.created_at,r.id)<(select created_at,id from listing_capability.reviews where uuid=$2)`
      : "";
    if (input.cursor) values.push(input.cursor);
    values.push(input.limit + 1);
    const rows = (
      await this.sql.query<ReviewRow>(
        `select r.uuid as id,l.uuid as listing_id,a.uuid as account_id,r.rating,r.body,r.status,r.created_at,r.updated_at,r.moderated_at,moderator.uuid as moderated_by,
                a.username as reviewer
         from listing_capability.reviews r join identity_capability.accounts a on a.id=r.account_id
         join listing_capability.listings l on l.id=r.listing_id left join identity_capability.accounts moderator on moderator.id=r.moderated_by
         where r.listing_id=(select id from listing_capability.listings where uuid=$1) and r.status='approved'${cursor}
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
        `(r.created_at,r.id)>(select created_at,id from listing_capability.reviews where uuid=$${values.length})`,
      );
    }
    values.push(input.limit + 1);
    const rows = (
      await this.sql.query<ReviewRow>(
        `select r.uuid as id,l.uuid as listing_id,a.uuid as account_id,r.rating,r.body,r.status,r.created_at,r.updated_at,r.moderated_at,moderator.uuid as moderated_by,
                a.username as reviewer,l.title as listing_title
         from listing_capability.reviews r join identity_capability.accounts a on a.id=r.account_id
         join listing_capability.listings l on l.id=r.listing_id left join identity_capability.accounts moderator on moderator.id=r.moderated_by ${where.length ? `where ${where.join(" and ")}` : ""}
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
        `select l.uuid as listing_id,round(avg(r.rating)::numeric,2)::text as average,count(*)::text as count
         from listing_capability.reviews r join listing_capability.listings l on l.id=r.listing_id where r.status='approved' and l.uuid=any($1::uuid[]) group by l.uuid`,
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
