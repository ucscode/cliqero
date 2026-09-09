import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";

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
    });
    const approvedAuthor = await app.authentication.register({
      email: "review-approved-author@example.com",
      username: "review_approved_author",
      password: "correct-horse-battery",
    });
    const authorA = await app.authentication.register({
      email: "review-author-a@example.com",
      username: "review_author_a",
      password: "correct-horse-battery",
    });
    const authorB = await app.authentication.register({
      email: "review-author-b@example.com",
      username: "review_author_b",
      password: "correct-horse-battery",
    });
    const listing = await app.listingService.createPublished(owner, {
      title: "Reviewable listing",
      description: "A published listing.",
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
    });
    const approvedAuthor = await app.authentication.register({
      email: "aggregate-approved@example.com",
      username: "aggregate_approved",
      password: "correct-horse-battery",
    });
    const pendingAuthor = await app.authentication.register({
      email: "aggregate-pending@example.com",
      username: "aggregate_pending",
      password: "correct-horse-battery",
    });
    const listing = await app.listingService.createPublished(owner, {
      title: "Aggregate listing",
      description: "A published listing.",
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
});
