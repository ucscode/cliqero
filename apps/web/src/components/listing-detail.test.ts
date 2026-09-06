import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ListingReviewSection, shouldRenderListingReviews } from "./listing-detail";

describe("listing detail review visibility", () => {
  it("hides review UI when storefront reviews are disabled", () => {
    expect(shouldRenderListingReviews(false, { average: 4.5, count: 2 })).toBe(false);
  });

  it("hides review UI when no approved aggregate exists", () => {
    expect(shouldRenderListingReviews(true, null)).toBe(false);
    expect(shouldRenderListingReviews(true, { average: 0, count: 0 })).toBe(false);
    const output = renderToStaticMarkup(
      createElement(ListingReviewSection, { reviewsVisible: true, rating: null }, "Review body"),
    );
    expect(output).not.toContain("Reviews");
    expect(output).not.toContain("listing-reviews");
    expect(output).not.toContain("border-t");
  });

  it("shows review UI only when approved aggregate records exist", () => {
    expect(shouldRenderListingReviews(true, { average: 4.5, count: 2 })).toBe(true);
    const output = renderToStaticMarkup(
      createElement(
        ListingReviewSection,
        { reviewsVisible: true, rating: { average: 4.5, count: 2 } },
        "Review body",
      ),
    );
    expect(output).toContain("Reviews");
    expect(output).toContain("listing-reviews");
  });
});
