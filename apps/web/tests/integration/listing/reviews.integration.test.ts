import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";
import { Account } from "@/modules/identity/account";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("listing review visibility", () => {
  const app = createContainer(databaseUrl!);

  beforeEach(async () => {
    await app.database.query(`truncate table
      better_auth."session",better_auth.account,better_auth.verification,better_auth."user",
      listing_capability.reviews,listing_capability.listings,
      identity_capability.account_capabilities,identity_capability.sessions,identity_capability.accounts
      restart identity cascade`);
  });

  afterAll(async () => {
    await app.database.close();
    await app.authentication.betterAuth.close();
  });

  it("returns approved reviews publicly and only each author's own unapproved review privately", async () => {
    const owner = await app.authentication.register({
      email: "review-owner@example.com",
      username: "review_owner",
      password: "correct-horse-battery",
      country: "NG",
    });
    const approvedAuthor = await app.authentication.register({
      email: "review-approved-author@example.com",
      username: "review_approved_author",
      password: "correct-horse-battery",
      country: "NG",
    });
    const authorA = await app.authentication.register({
      email: "review-author-a@example.com",
      username: "review_author_a",
      password: "correct-horse-battery",
      country: "NG",
    });
    const authorB = await app.authentication.register({
      email: "review-author-b@example.com",
      username: "review_author_b",
      password: "correct-horse-battery",
      country: "NG",
    });
    const listing = await app.listingService.createPublished(owner, {
      title: "Reviewable listing",
      shortDescription: "A reviewable listing",
      longDescription: "A published listing.",
      priceMinor: "100",
      currency: "USD",
      destination: "https://example.com/access",
    });
    const approved = await app.listingReviews.submit(approvedAuthor, listing.id, {
      rating: 4,
      body: "Approved review",
    });
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'system.root')`,
      [owner.id],
    );
    await app.listingReviews.moderate(owner, approved.id, "approved");
    const pendingA = await app.listingReviews.submit(authorA, listing.id, {
      rating: 3,
      body: "Pending review from A",
    });
    const pendingB = await app.listingReviews.submit(authorB, listing.id, {
      rating: 5,
      body: "Pending review from B",
    });

    const anonymous = await app.listingReviews.visible({ listingId: listing.id, limit: 10 });
    const visibleToA = await app.listingReviews.visible({
      listingId: listing.id,
      accountId: authorA.id,
      limit: 10,
    });
    const visibleToB = await app.listingReviews.visible({
      listingId: listing.id,
      accountId: authorB.id,
      limit: 10,
    });

    expect(anonymous.items.map((review) => review.id)).toEqual([approved.id]);
    expect(visibleToA.items.map((review) => review.id)).toEqual([pendingA.id, approved.id]);
    expect(visibleToB.items.map((review) => review.id)).toEqual([pendingB.id, approved.id]);

    const summary = await app.listingReviews.summariesForListings([listing.id]);
    expect(summary.get(listing.id)).toEqual({ average: 4, count: 1 });
  });

  it("keeps approved aggregate data separate from the author's pending replacement", async () => {
    const owner = await app.authentication.register({
      email: "aggregate-owner@example.com",
      username: "aggregate_owner",
      password: "correct-horse-battery",
      country: "NG",
    });
    const approvedAuthor = await app.authentication.register({
      email: "aggregate-approved@example.com",
      username: "aggregate_approved",
      password: "correct-horse-battery",
      country: "NG",
    });
    const pendingAuthor = await app.authentication.register({
      email: "aggregate-pending@example.com",
      username: "aggregate_pending",
      password: "correct-horse-battery",
      country: "NG",
    });
    const listing = await app.listingService.createPublished(owner, {
      title: "Aggregate listing",
      shortDescription: "A listing with aggregate reviews",
      longDescription: "A published listing.",
      priceMinor: "100",
      currency: "USD",
      destination: "https://example.com/access",
    });
    const approved = await app.listingReviews.submit(approvedAuthor, listing.id, { rating: 4 });
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'system.root')`,
      [owner.id],
    );
    await app.listingReviews.moderate(owner, approved.id, "approved");
    const pending = await app.listingReviews.submit(pendingAuthor, listing.id, { rating: 1 });

    const visible = await app.listingReviews.visible({
      listingId: listing.id,
      accountId: pendingAuthor.id,
      limit: 10,
    });
    const summary = await app.listingReviews.summariesForListings([listing.id]);

    expect(visible.items.map((review) => review.id)).toEqual([pending.id, approved.id]);
    expect(summary.get(listing.id)).toEqual({ average: 4, count: 1 });
  });

  it("orders rating by approved average then review count and paginates without gaps", async () => {
    const owner = await app.authentication.register({
      email: "rating-sort-owner@example.com",
      username: "rating_sort_owner",
      password: "correct-horse-battery",
      country: "NG",
    });
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'system.root')`,
      [owner.id],
    );
    const createListing = (externalKey: string) =>
      app.listingService.createPublished(owner, {
        title: `Rating listing ${externalKey}`,
        shortDescription: "Listing used to verify rating sort",
        longDescription: "Rating sort integration fixture.",
        priceMinor: "100",
        currency: "USD",
        destination: `https://example.test/${externalKey}`,
        externalKey,
      });
    const highFour = await createListing("rating-high-four");
    const highOne = await createListing("rating-high-one");
    const midTen = await createListing("rating-mid-ten");
    const noReviews = await createListing("rating-unrated-none");
    const pendingOnly = await createListing("rating-unrated-pending");
    const rejectedOnly = await createListing("rating-unrated-rejected");
    const authors = Array.from({ length: 16 }, (_, index) => {
      const id = newId();
      const username = `rating_author_${index}`;
      return new Account(id, username);
    });
    for (const author of authors)
      await app.database.query(
        "insert into identity_capability.accounts(uuid,username) values($1,$2)",
        [author.id, author.username],
      );

    const approvedRatings = [
      ...Array.from({ length: 4 }, (_, index) => [highFour, authors[index]!, 5] as const),
      [highOne, authors[4]!, 5] as const,
      ...[5, 5, 5, 5, 5, 4, 4, 4, 4, 4].map(
        (rating, index) => [midTen, authors[index + 5]!, rating] as const,
      ),
    ];
    for (const [listing, author, rating] of approvedRatings) {
      const review = await app.listingReviews.submit(author, listing.id, { rating });
      await app.listingReviews.moderate(owner, review.id, "approved");
    }
    const pending = await app.listingReviews.submit(authors[15]!, pendingOnly.id, { rating: 1 });
    const rejected = await app.listingReviews.submit(authors[14]!, rejectedOnly.id, { rating: 5 });
    await app.listingReviews.moderate(owner, rejected.id, "rejected");
    expect(pending.status).toBe("pending");

    const collect = async (direction: "asc" | "desc") => {
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await app.listingService.queryPublic({
          sort: "rating",
          direction,
          cursor,
          limit: 2,
        });
        ids.push(...page.items.map((listing) => listing.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return ids;
    };
    const descending = await collect("desc");
    const ascending = await collect("asc");
    const unrated = [noReviews.id, pendingOnly.id, rejectedOnly.id].sort();

    expect(descending).toEqual([highFour.id, highOne.id, midTen.id, ...unrated]);
    expect(ascending).toEqual([midTen.id, highFour.id, highOne.id, ...unrated]);
    expect(new Set(descending).size).toBe(6);
    expect(new Set(ascending).size).toBe(6);
    await expect(
      app.listingService.queryPublic({
        sort: "rating",
        direction: "asc",
        cursor: (
          await app.listingService.queryPublic({ sort: "rating", direction: "desc", limit: 1 })
        ).nextCursor!,
        limit: 1,
      }),
    ).rejects.toThrow("Listing cursor does not match this catalogue query");
    expect(
      await app.listingReviews.summariesForListings([pendingOnly.id, rejectedOnly.id]),
    ).toEqual(new Map());
  });

  it("bulk moderation changes only pending reviews and refuses later invalid transitions", async () => {
    const owner = await app.authentication.register({
      email: "bulk-review-owner@example.com",
      username: "bulk_review_owner",
      password: "correct-horse-battery",
      country: "NG",
    });
    const authorA = await app.authentication.register({
      email: "bulk-review-a@example.com",
      username: "bulk_review_a",
      password: "correct-horse-battery",
      country: "NG",
    });
    const authorB = await app.authentication.register({
      email: "bulk-review-b@example.com",
      username: "bulk_review_b",
      password: "correct-horse-battery",
      country: "NG",
    });
    const listing = await app.listingService.createPublished(owner, {
      title: "Bulk moderation listing",
      shortDescription: "Listing for bulk review moderation",
      longDescription: "A published listing.",
      priceMinor: "100",
      currency: "USD",
      destination: "https://example.com/bulk-review",
    });
    const first = await app.listingReviews.submit(authorA, listing.id, { rating: 4 });
    const second = await app.listingReviews.submit(authorB, listing.id, { rating: 5 });
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'system.root')`,
      [owner.id],
    );

    const results = await app.listingReviews.moderateMany(owner, [first.id, second.id], "approved");
    expect(results).toEqual([
      { id: first.id, success: true },
      { id: second.id, success: true },
    ]);
    await expect(app.listingReviews.moderateMany(owner, [first.id], "rejected")).resolves.toEqual([
      {
        id: first.id,
        success: false,
        error: "Review not found or is no longer pending",
      },
    ]);

    const approved = await app.listingReviews.operatorQueue(owner, {
      status: "approved",
      limit: 10,
    });
    expect(approved.items.map((review) => review.id)).toEqual(
      expect.arrayContaining([first.id, second.id]),
    );
    expect(approved.items).toHaveLength(2);
    expect(approved.items.every((review) => review.moderatedBy === owner.id)).toBe(true);
    await expect(app.listingReviews.moderateMany(authorA, [second.id], "rejected")).rejects.toThrow(
      "Forbidden",
    );
  });
});
