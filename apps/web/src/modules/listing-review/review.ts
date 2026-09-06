import { DomainInvariantError } from "@/kernel/errors";
import type { Id } from "@/kernel/ids";

export type ReviewStatus = "pending" | "approved" | "rejected";

export type ListingReview = Readonly<{
  id: Id;
  listingId: Id;
  accountId: Id;
  rating: number;
  body: string;
  status: ReviewStatus;
  createdAt: Date;
  updatedAt: Date;
  moderatedAt: Date | null;
  moderatedBy: Id | null;
}>;

export interface ListingReviewRepository {
  findMine(listingId: Id, accountId: Id): Promise<ListingReview | null>;
  savePending(input: {
    id: Id;
    listingId: Id;
    accountId: Id;
    rating: number;
    body: string;
  }): Promise<ListingReview>;
  moderate(id: Id, status: "approved" | "rejected", moderatorId: Id): Promise<ListingReview | null>;
  queryPublic(input: {
    listingId: Id;
    cursor?: string;
    limit: number;
  }): Promise<{ items: readonly PublicListingReview[]; nextCursor: string | null }>;
  queryOperator(input: {
    status?: ReviewStatus;
    cursor?: string;
    limit: number;
  }): Promise<{ items: readonly OperatorListingReview[]; nextCursor: string | null }>;
  summariesForListings(listingIds: readonly Id[]): Promise<Map<Id, RatingSummary>>;
}

export type RatingSummary = Readonly<{ average: number; count: number }>;
export type PublicListingReview = ListingReview & Readonly<{ reviewer: string }>;
export type OperatorListingReview = ListingReview &
  Readonly<{ reviewer: string; listingTitle: string }>;

export function validateReviewInput(rating: number, body: string | undefined) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw new DomainInvariantError("Rating must be an integer from 1 to 5");
  const normalized = (body ?? "").trim();
  if (normalized.length > 2000)
    throw new DomainInvariantError("Review body must be 2,000 characters or less");
  return normalized;
}
