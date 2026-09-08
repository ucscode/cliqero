import { describe, expect, it } from "vitest";
import type { ListingReview } from "@/lib/api-client";
import { replaceOwnReview, visibleRating } from "./listing-reviews";

function review(id: string, isMine = false): ListingReview {
  return {
    id,
    listing_id: "listing-id",
    rating: 4,
    body: "Useful resource.",
    status: isMine ? "pending" : "approved",
    created_at: "2026-09-07T10:00:00.000Z",
    updated_at: "2026-09-07T10:00:00.000Z",
    moderated_at: null,
    reviewer: isMine ? "my_username" : `reviewer_${id}`,
    is_mine: isMine,
  };
}

describe("listing review rating interaction", () => {
  it("starts unselected and previews hover without changing the selected rating", () => {
    expect(visibleRating(0, 0)).toBe(0);
    expect(visibleRating(0, 3)).toBe(3);
    expect(visibleRating(3, 0)).toBe(3);
    expect(visibleRating(3, 5)).toBe(5);
    expect(visibleRating(3, 0)).toBe(3);
  });

  it("replaces the author's own review immediately without duplicating public reviews", () => {
    const approved = review("approved");
    const previousMine = review("mine", true);
    const submittedMine = { ...review("mine", true), rating: 5, body: "Updated review." };

    expect(replaceOwnReview([approved, previousMine], submittedMine)).toEqual([
      submittedMine,
      approved,
    ]);
  });
});
