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
  it("shows the compact category summary and rated state, with the member badge over media", () => {
    const html = renderToStaticMarkup(
      createElement(ListingCard, {
        listing: listing({ rating: { average: 4, count: 2 } }),
        reviewsVisible: true,
      }),
    );
    expect(html).toContain('aria-label="Members only: sign in required to view this listing"');
    expect(html).toContain("API · Product +1");
    expect(html).toContain(">4.0</span>");
    expect(html).toContain("fill-amber-400");
    expect(html).toMatch(
      /<div class="relative">.*aria-label="Members only: sign in required to view this listing"/,
    );
    expect(html.indexOf("Members only")).toBeLessThan(html.indexOf("Categories:"));
    expect(html.indexOf("API · Product +1")).toBeLessThan(html.indexOf("Useful listing"));
    expect(html).toContain("<del");
    expect(html).toContain("$40.00");
    expect(html).toContain("$24.00");
  });

  it("shows an accessible unfilled zero rating for listings without approved reviews", () => {
    const html = renderToStaticMarkup(
      createElement(ListingCard, { listing: listing(), reviewsVisible: true }),
    );
    expect(html).toContain('aria-label="No reviews yet"');
    expect(html).toContain(">0.0</span>");
    expect(html).toMatch(/class="lucide lucide-star h-4 w-4 text-slate-400"/);
    expect(html).not.toContain("fill-amber-400");
  });

  it("never supplies a fallback category and summarizes at most two names", () => {
    expect(compactCategoryLabel([])).toBe("");
    expect(compactCategoryLabel([{ name: "API" }])).toBe("API");
    expect(compactCategoryLabel([{ name: "Toolkit" }, { name: "API" }])).toBe("API · Toolkit");
    expect(
      compactCategoryLabel([
        { name: "Toolkit" },
        { name: "API" },
        { name: "Product" },
        { name: "Research" },
        { name: "Writing" },
      ]),
    ).toBe("API · Product +3");
    const html = renderToStaticMarkup(
      createElement(ListingCard, { listing: listing({ categories: [] }), reviewsVisible: true }),
    );
    expect(html).not.toContain("Uncategorized");
    expect(html).not.toContain('aria-label="Categories: "');
    expect(html).toContain("whitespace-nowrap");
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
    expect(html).toContain('aria-label="No reviews yet"');
    expect(html).toContain("$40.00");
    expect(html).toContain(">Free</span>");
  });

  it("uses a deterministic compact label for multiple categories", () => {
    expect(compactCategoryLabel([{ name: "Toolkit" }, { name: "API" }, { name: "Product" }])).toBe(
      "API · Product +1",
    );
  });
});
