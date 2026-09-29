import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListingCard, compactCategoryLabel } from "@/components/listing/card";
import type { Listing } from "@/lib/api-client";

const listing = (overrides: Partial<Listing> = {}): Listing => ({
  id: "00000000-0000-4000-8000-000000000001",
  title: "Useful listing",
  short_description: "A short summary",
  long_description: "Long details",
  test_only: null,
  price: { minor_amount: "2400", currency: "USD" },
  compare_at_price: { minor_amount: "4000", currency: "USD" },
  visibility: "authenticated",
  categories: [
    { id: "a", name: "API", slug: "api" },
    { id: "b", name: "Product", slug: "product" },
    { id: "c", name: "Toolkit", slug: "toolkit" },
  ],
  metadata: {},
  rating: null,
  media: [],
  ...overrides,
});

describe("catalogue listing card", () => {
  it("places lock, compact categories, and a real rating in the metadata row", () => {
    const html = renderToStaticMarkup(
      createElement(ListingCard, {
        listing: listing({ rating: { average: 4, count: 2 } }),
        reviewsVisible: true,
      }),
    );
    expect(html).toContain("Members only");
    expect(html).toContain("API · Product +1");
    expect(html).toContain("4.0");
    expect(html.indexOf("API · Product +1")).toBeLessThan(html.indexOf("Useful listing"));
    expect(html).toContain("<del");
    expect(html).toContain("$40.00");
    expect(html).toContain("$24.00");
  });

  it("does not render an empty-star or 0.0 rating for an unrated listing", () => {
    const html = renderToStaticMarkup(
      createElement(ListingCard, { listing: listing(), reviewsVisible: true }),
    );
    expect(html).not.toContain("No ratings yet");
    expect(html).not.toContain('aria-label="0 out of 5 stars"');
    expect(html).not.toContain("lucide lucide-star");
  });

  it("keeps public listings unmarked and formats a free compare-at price", () => {
    const html = renderToStaticMarkup(
      createElement(ListingCard, {
        listing: listing({
          visibility: "public",
          price: { minor_amount: "0", currency: "USD" },
          categories: [],
        }),
        reviewsVisible: false,
      }),
    );
    expect(html).not.toContain("Members only");
    expect(html).toContain("$40.00");
    expect(html).toContain(">Free</span>");
  });

  it("uses a deterministic compact label for multiple categories", () => {
    expect(compactCategoryLabel([{ name: "Toolkit" }, { name: "API" }, { name: "Product" }])).toBe(
      "API · Product +1",
    );
  });
});
