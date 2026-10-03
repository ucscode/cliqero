import { newId, type Id } from "@/kernel/ids";
import type { Account } from "@/modules/identity/account";
import type { ListingRepository } from "@/modules/listing";
import {
  type ListingReviewRepository,
  type ListingReview,
  type OperatorListingReview,
  type ReviewStatus,
  validateReviewInput,
} from "@/modules/listing/reviews/review";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import type { AuditRecorder } from "@/application/shared/audit";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import { PublicApplicationError } from "@/kernel/errors";
import { CrudService } from "@/kernel/crud";

export class ListingReviewService extends CrudService<
  [account: Account, listingId: Id, input: { rating: number; body?: string }],
  [account: Account, reviewId: Id],
  [
    account: Account,
    reviewId: Id,
    input: { rating?: number; body?: string; status?: ReviewStatus },
  ],
  [account: Account, reviewId: Id],
  Promise<ListingReview>,
  Promise<ListingReview | OperatorListingReview>,
  Promise<OperatorListingReview>,
  Promise<{ id: Id }>
> {
  constructor(
    private readonly reviews: ListingReviewRepository,
    private readonly listings: ListingRepository,
    private readonly operators: OperatorAuthorizationService,
    private readonly audit?: AuditRecorder,
    private readonly uow?: UnitOfWork,
  ) {
    super();
  }
  override async create(account: Account, listingId: Id, input: { rating: number; body?: string }) {
    const listing = await this.listings.findById(listingId);
    if (!listing || listing.state !== "published") throw new Error("Listing not found");
    return this.reviews.create({
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
    return this.visibleForListing(input);
  }
  private async visibleForListing(input: {
    listingId: Id;
    accountId?: Id;
    cursor?: string;
    limit: number;
  }) {
    const listing = await this.listings.findById(input.listingId);
    if (
      !listing ||
      listing.state !== "published" ||
      (listing.visibility === "authenticated" && !input.accountId)
    )
      return { items: [], nextCursor: null };
    return this.reviews.queryVisible(input);
  }
  override async get(account: Account, reviewId: Id) {
    await this.operators.requireCapability(account.id, "reviews.moderate");
    const review = await this.reviews.findById(reviewId);
    if (!review) throw new PublicApplicationError("Review not found.", "not_found", 404);
    return review;
  }
  override async update(
    account: Account,
    reviewId: Id,
    input: { rating?: number; body?: string; status?: ReviewStatus },
  ) {
    await this.operators.requireCapability(account.id, "reviews.moderate");
    const operation = async () => {
      const current = await this.reviews.findById(reviewId);
      if (!current) throw new PublicApplicationError("Review not found.", "not_found", 404);
      const rating = input.rating ?? current.rating;
      const body = validateReviewInput(rating, input.body ?? current.body);
      const status = input.status ?? current.status;
      const updated = await this.reviews.update(reviewId, {
        rating,
        body,
        status,
        moderatorId: account.id,
      });
      if (!updated) throw new PublicApplicationError("Review not found.", "not_found", 404);
      await this.audit?.record({
        actorId: account.id,
        action: "review.updated",
        subjectType: "review",
        subjectId: reviewId,
        previousState: { rating: current.rating, body: current.body, status: current.status },
        newState: { rating, body, status },
      });
      return updated;
    };
    return this.uow ? this.uow.transaction(operation) : operation();
  }
  override async delete(account: Account, reviewId: Id) {
    await this.operators.requireCapability(account.id, "reviews.moderate");
    const operation = async () => {
      const current = await this.reviews.findById(reviewId);
      if (!current) throw new PublicApplicationError("Review not found.", "not_found", 404);
      await this.audit?.record({
        actorId: account.id,
        action: "review.deleted",
        subjectType: "review",
        subjectId: reviewId,
        previousState: {
          listingId: current.listingId,
          rating: current.rating,
          status: current.status,
        },
        newState: { deleted: true },
      });
      if (!(await this.reviews.delete(reviewId)))
        throw new PublicApplicationError("Review not found.", "not_found", 404);
      return { id: reviewId };
    };
    return this.uow ? this.uow.transaction(operation) : operation();
  }
  async operatorQueue(
    account: Account,
    input: {
      status?: ReviewStatus;
      listingId?: Id;
      cursor?: string;
      limit: number;
      sort?: "submitted" | "rating";
      direction?: "asc" | "desc";
    },
  ) {
    await this.operators.requireCapability(account.id, "reviews.moderate");
    return this.reviews.queryOperator(input);
  }
  summariesForListings(listingIds: readonly Id[]) {
    return this.reviews.summariesForListings(listingIds);
  }
}
