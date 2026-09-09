import { newId, type Id } from "@/kernel/ids";
import type { Account } from "@/modules/identity/account";
import type { ListingRepository } from "@/modules/listing/listing";
import {
  type ListingReviewRepository,
  type ReviewStatus,
  validateReviewInput,
} from "@/modules/listing-review/review";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";

export class ListingReviewService {
  constructor(
    private readonly reviews: ListingReviewRepository,
    private readonly listings: ListingRepository,
    private readonly operators: OperatorAuthorizationService,
  ) {}
  async submit(account: Account, listingId: Id, input: { rating: number; body?: string }) {
    const listing = await this.listings.findById(listingId);
    if (!listing || listing.state !== "published") throw new Error("Listing not found");
    return this.reviews.savePending({
      id: newId(),
      listingId,
      accountId: account.id,
      rating: input.rating,
      body: validateReviewInput(input.rating, input.body),
    });
  }
  mine(account: Account, listingId: Id) {
    return this.reviews.findMine(listingId, account.id);
  }
  visible(input: { listingId: Id; accountId?: Id; cursor?: string; limit: number }) {
    return this.reviews.queryVisible(input);
  }
  async moderate(account: Account, reviewId: Id, status: "approved" | "rejected") {
    await this.operators.requireCapability(account.id, "reviews.moderate");
    const review = await this.reviews.moderate(reviewId, status, account.id);
    if (!review) throw new Error("Review not found");
    return review;
  }
  async operatorQueue(
    account: Account,
    input: { status?: ReviewStatus; cursor?: string; limit: number },
  ) {
    await this.operators.requireCapability(account.id, "reviews.moderate");
    return this.reviews.queryOperator(input);
  }
  summariesForListings(listingIds: readonly Id[]) {
    return this.reviews.summariesForListings(listingIds);
  }
}
