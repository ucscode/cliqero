import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ListingReviewSection, shouldRenderListingReviews } from "@/components/listing/detail";

describe("listing detail review visibility", () => {
  it("hides review UI when storefront reviews are disabled", () => {
    expect(shouldRenderListingReviews(false)).toBe(false);
  });

  it("renders the empty reviews section when there are no approved ratings", () => {
    expect(shouldRenderListingReviews(true)).toBe(true);
    const output = renderToStaticMarkup(
      createElement(ListingReviewSection, { reviewsVisible: true, rating: null }, "Review body"),
    );
    expect(output).toContain("Reviews");
    expect(output).toContain("No reviews yet.");
    expect(output).toContain("Review body");
  });

  it("shows the rating summary and reviews when approved aggregate records exist", () => {
    const output = renderToStaticMarkup(
      createElement(
        ListingReviewSection,
        { reviewsVisible: true, rating: { average: 4.5, count: 2 } },
        "Review body",
      ),
    );
    expect(output).toContain("Reviews");
    expect(output).toContain("listing-reviews");
    expect(output).toContain("4.5");
    expect(output).not.toContain("No reviews yet.");
  });

  it("keeps the first-review composer in the enabled zero-rating composition", () => {
    const detailSource = readFileSync(
      resolve(process.cwd(), "src/components/listing/detail.tsx"),
      "utf8",
    );
    const sectionSource = detailSource.slice(
      detailSource.indexOf("<ListingReviewSection"),
      detailSource.indexOf("</ListingReviewSection>"),
    );
    expect(sectionSource).toContain("<ListingReviews listingId={currentListing.id} />");
    const reviewsSource = readFileSync(
      resolve(process.cwd(), "src/components/listing/reviews.tsx"),
      "utf8",
    );
    expect(reviewsSource).toContain("{session.data?.user && (");
  });

  it("hides the complete section when reviews are disabled", () => {
    const output = renderToStaticMarkup(
      createElement(ListingReviewSection, { reviewsVisible: false, rating: null }, "Review body"),
    );
    expect(output).not.toContain("listing-reviews");
    expect(output).not.toContain("No reviews yet.");
    expect(output).not.toContain("Review body");
  });
});
