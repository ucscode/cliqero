import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { OperatorBulkWorkflow } from "@/application/operator/bulk-workflow";
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

  it("orders the moderation queue by submitted time or rating with cursor-safe ties", async () => {
    const owner = await app.authentication.register({
      email: "review-sort-owner@example.test",
      username: "review_sort_owner",
      password: "correct-horse-battery",
      country: "NG",
    });
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'reviews.moderate')`,
      [owner.id],
    );
    const listing = await app.listingService.createPublished(owner, {
      title: "Review sorting listing",
      shortDescription: "Sorting",
      longDescription: "Sorting reviews",
      priceMinor: "100",
      currency: "USD",
      destination: "https://example.test/sort",
    });
    const ratings = [5, 3, 5, 1];
    const submitted = [];
    for (let index = 0; index < ratings.length; index++) {
      const author = await app.authentication.register({
        email: `review-sort-${index}@example.test`,
        username: `review_sort_${index}`,
        password: "correct-horse-battery",
        country: "NG",
      });
      submitted.push(
        await app.listingReviews.submit(author, listing.id, { rating: ratings[index]! }),
      );
    }
    await app.database.query(
      `update listing_capability.reviews set created_at='2026-01-01T00:00:00Z'::timestamptz where listing_id=(select id from listing_capability.listings where uuid=$1)`,
      [listing.id],
    );
    const descending = await app.listingReviews.operatorQueue(owner, {
      sort: "rating",
      direction: "desc",
      limit: 2,
    });
    expect(descending.items.map((review) => review.rating)).toEqual([5, 5]);
    expect(descending.nextCursor).toBeTruthy();
    const continued = await app.listingReviews.operatorQueue(owner, {
      sort: "rating",
      direction: "desc",
      cursor: descending.nextCursor!,
      limit: 10,
    });
    expect([...descending.items, ...continued.items].map((review) => review.rating)).toEqual([
      5, 5, 3, 1,
    ]);
    expect(new Set([...descending.items, ...continued.items].map((review) => review.id)).size).toBe(
      4,
    );
    await expect(
      app.listingReviews.operatorQueue(owner, {
        sort: "submitted",
        direction: "desc",
        cursor: descending.nextCursor!,
        limit: 2,
      }),
    ).rejects.toThrow("Invalid or stale pagination cursor");
    expect(submitted).toHaveLength(4);
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

  it("moderates reviews through individual resource operations and refuses invalid transitions", async () => {
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

    const results = await Promise.all([
      app.listingReviews.moderate(owner, first.id, "approved"),
      app.listingReviews.moderate(owner, second.id, "approved"),
    ]);
    expect(results.map((review) => review.id)).toEqual([first.id, second.id]);
    await expect(app.listingReviews.moderate(owner, first.id, "rejected")).rejects.toThrow(
      "Review not found or is no longer pending",
    );

    const approved = await app.listingReviews.operatorQueue(owner, {
      status: "approved",
      limit: 10,
    });
    expect(approved.items.map((review) => review.id)).toEqual(
      expect.arrayContaining([first.id, second.id]),
    );
    expect(approved.items).toHaveLength(2);
    expect(approved.items.every((review) => review.moderatedBy === owner.id)).toBe(true);
    await expect(app.listingReviews.moderate(authorA, second.id, "rejected")).rejects.toThrow(
      "Forbidden",
    );
  });

  it("supports authorized review inspection, long-content edits, listing filters, and audited deletion", async () => {
    const owner = await app.authentication.register({
      email: "review-crud-owner@example.test",
      username: "review_crud_owner",
      password: "correct-horse-battery",
      country: "NG",
    });
    const author = await app.authentication.register({
      email: "review-crud-author@example.test",
      username: "review_crud_author",
      password: "correct-horse-battery",
      country: "NG",
    });
    const unrelatedOwner = await app.authentication.register({
      email: "review-crud-unrelated@example.test",
      username: "review_crud_unrelated",
      password: "correct-horse-battery",
      country: "NG",
    });
    const listing = await app.listingService.createPublished(owner, {
      title: "Review CRUD listing",
      shortDescription: "Review CRUD summary",
      longDescription: "A listing used to test operator review CRUD.",
      priceMinor: "100",
      currency: "USD",
      destination: "https://example.test/review-crud",
    });
    const unrelatedListing = await app.listingService.createPublished(unrelatedOwner, {
      title: "Unrelated review listing",
      shortDescription: "Another review summary",
      longDescription: "A separate listing.",
      priceMinor: "100",
      currency: "USD",
      destination: "https://example.test/review-unrelated",
    });
    const edited = await app.listingReviews.submit(author, listing.id, {
      rating: 3,
      body: "Initial content",
    });
    const retained = await app.listingReviews.submit(author, unrelatedListing.id, {
      rating: 5,
      body: "Unrelated content",
    });
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'reviews.moderate'),
             ((select id from identity_capability.accounts where uuid=$2),'reviews.moderate')`,
      [owner.id, unrelatedOwner.id],
    );
    await app.listingReviews.moderate(owner, edited.id, "approved");
    await app.listingReviews.moderate(unrelatedOwner, retained.id, "approved");

    const initialDetail = await app.listingReviews.getOperator(owner, edited.id);
    expect(initialDetail).toMatchObject({
      reviewer: "review_crud_author",
      listingTitle: "Review CRUD listing",
    });
    await expect(app.listingReviews.update(author, edited.id, { rating: 1 })).rejects.toThrow(
      "Forbidden",
    );
    const longBody = "A detailed operator-edited review. ".repeat(40);
    const updated = await app.listingReviews.update(owner, edited.id, {
      rating: 4,
      body: longBody,
      status: "pending",
    });
    expect(updated).toMatchObject({ rating: 4, body: longBody.trim(), status: "pending" });
    const byListing = await app.listingReviews.operatorQueue(owner, {
      listingId: listing.id,
      limit: 10,
    });
    expect(byListing.items.map((item) => item.id)).toEqual([edited.id]);
    expect((await app.listingReviews.summariesForListings([listing.id])).get(listing.id)).toBe(
      undefined,
    );

    await app.listingReviews.update(owner, edited.id, { status: "approved" });
    expect((await app.listingReviews.summariesForListings([listing.id])).get(listing.id)).toEqual({
      average: 4,
      count: 1,
    });
    await app.listingReviews.delete(owner, edited.id);
    await expect(app.listingReviews.getOperator(owner, edited.id)).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
    expect((await app.listingReviews.summariesForListings([listing.id])).has(listing.id)).toBe(
      false,
    );
    expect(
      (await app.listingReviews.summariesForListings([unrelatedListing.id])).get(
        unrelatedListing.id,
      ),
    ).toEqual({ average: 5, count: 1 });
    const audit = await app.database.query<{ action: string }>(
      `select action from kernel.audit_records where subject_type='review' and subject_id=$1 order by id`,
      [edited.id],
    );
    expect(audit.rows.map(({ action }) => action)).toEqual([
      "review.moderated",
      "review.updated",
      "review.updated",
      "review.deleted",
    ]);
  });

  it("bulk-sets approved or rejected status across mixed states and deletes with partial outcomes", async () => {
    const operator = await app.authentication.register({
      email: "review_bulk_operator@example.test",
      username: "review_bulk_operator",
      password: "correct-horse-battery",
      country: "NG",
    });
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'reviews.moderate')`,
      [operator.id],
    );
    const listing = await app.listingService.createPublished(operator, {
      title: "Bulk review listing",
      shortDescription: "Bulk moderation fixture",
      longDescription: "Used to verify review bulk workflows.",
      priceMinor: "100",
      currency: "USD",
      destination: "https://example.test/review-bulk",
    });
    const reviews = [];
    for (let index = 0; index < 3; index++) {
      const author = await app.authentication.register({
        email: `review_bulk_author_${index}@example.test`,
        username: `review_bulk_author_${index}`,
        password: "correct-horse-battery",
        country: "NG",
      });
      reviews.push(
        await app.listingReviews.submit(author, listing.id, {
          rating: index + 3,
          body: `Bulk review ${index}`,
        }),
      );
    }
    await app.listingReviews.moderate(operator, reviews[0]!.id, "approved");
    await app.listingReviews.moderate(operator, reviews[1]!.id, "rejected");
    const workflow = new OperatorBulkWorkflow(app);

    await expect(
      workflow.execute(operator, {
        resource: "reviews",
        action: "moderate",
        status: "approved",
        ids: reviews.map(({ id }) => id),
      }),
    ).resolves.toEqual({ succeeded: reviews.map(({ id }) => id), failed: [] });
    expect((await app.listingReviews.summariesForListings([listing.id])).get(listing.id)).toEqual({
      average: 4,
      count: 3,
    });

    await app.listingReviews.update(operator, reviews[0]!.id, { status: "rejected" });
    await app.listingReviews.update(operator, reviews[2]!.id, { status: "pending" });
    await expect(
      workflow.execute(operator, {
        resource: "reviews",
        action: "moderate",
        status: "rejected",
        ids: reviews.map(({ id }) => id),
      }),
    ).resolves.toEqual({ succeeded: reviews.map(({ id }) => id), failed: [] });
    expect(
      (await app.listingReviews.operatorQueue(operator, { status: "rejected", limit: 10 })).items,
    ).toHaveLength(3);

    const missingId = newId();
    await expect(
      workflow.execute(operator, {
        resource: "reviews",
        action: "delete",
        ids: [...reviews.map(({ id }) => id), missingId],
      }),
    ).resolves.toEqual({
      succeeded: reviews.map(({ id }) => id),
      failed: [{ id: missingId, message: "Review not found." }],
    });
    expect((await app.listingReviews.visible({ listingId: listing.id, limit: 10 })).items).toEqual(
      [],
    );
    expect((await app.listingReviews.summariesForListings([listing.id])).has(listing.id)).toBe(
      false,
    );
    expect(
      (await app.listingReviews.operatorQueue(operator, { listingId: listing.id, limit: 10 }))
        .items,
    ).toEqual([]);
    const deletedAudit = await app.database.query<{ count: string }>(
      `select count(*)::text count from kernel.audit_records where action='review.deleted' and subject_type='review'`,
    );
    expect(deletedAudit.rows[0]?.count).toBe("3");
  });
});
