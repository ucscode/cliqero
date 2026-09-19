import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ListingDescription, listingDescription } from "@/components/listing/description";
import { ListingMarkdown } from "@/components/listing/markdown";
import { ListingCard } from "@/components/listing/card";
import { listingDetailDescription } from "@/components/listing/detail";

describe("listing description presentation", () => {
  it("keeps meaningful descriptions unchanged", () => {
    expect(listingDescription("A practical toolkit.")).toBe("A practical toolkit.");
  });

  it("does not invent copy for empty descriptions", () => {
    expect(listingDescription("   ")).toBe("");
    expect(renderToStaticMarkup(createElement(ListingDescription, { description: "   " }))).toBe(
      "",
    );
  });

  it("derives safe plain-text excerpts without rich Markdown syntax", () => {
    expect(
      listingDescription(
        "# A guide\n\nRead **this** [useful guide](https://example.com).\n\n![Cover](https://example.com/cover.png)\n\n- One\n- Two",
      ),
    ).toBe("A guide Read this useful guide. One Two");
  });

  it("renders sanitized Markdown content with safe external links and images", () => {
    const markup = renderToStaticMarkup(
      createElement(ListingMarkdown, {
        content:
          '## Details\n\n[Read more](https://example.com)\n\n![Preview](https://example.com/image.png)\n\n<script>alert("x")</script>',
      }),
    );
    expect(markup).toContain("<h2");
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noreferrer noopener"');
    expect(markup).toContain('loading="lazy"');
    expect(markup).not.toContain("<script");
  });

  it("clamps card excerpts to the shared three-line presentation", () => {
    const markup = renderToStaticMarkup(
      createElement(ListingDescription, {
        description: "One two three four five six seven eight nine ten eleven twelve.",
      }),
    );
    expect(markup).toContain("line-clamp-3");
  });

  it("uses only the short description in catalogue cards", () => {
    const markup = renderToStaticMarkup(
      createElement(ListingCard, {
        listing: {
          id: "listing-1",
          title: "Listing",
          short_description: "Quick benefit",
          long_description: "Long Markdown details that belong on the detail page.",
          price: { minor_amount: "100", currency: "USD" },
          metadata: {},
          rating: null,
          media: [],
          test_only: null,
        },
        reviewsVisible: false,
      }),
    );
    expect(markup).toContain("Quick benefit");
    expect(markup).not.toContain("Long Markdown details");
  });

  it("uses the long description for the single-listing detail body", () => {
    expect(
      listingDetailDescription({
        long_description: "Long Markdown details",
      }),
    ).toBe("Long Markdown details");
  });
});
