import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListingPrice } from "@/components/listing/price";

describe("listing price presentation", () => {
  it("shows Free for zero-price listings while retaining normal paid formatting", () => {
    expect(
      renderToStaticMarkup(createElement(ListingPrice, { minorAmount: "0", currency: "USD" })),
    ).toContain(">Free</span>");
    expect(
      renderToStaticMarkup(createElement(ListingPrice, { minorAmount: "1250", currency: "USD" })),
    ).toContain("$12.50");
  });

  it("renders the compare-at amount semantically while retaining a free price", () => {
    const paid = renderToStaticMarkup(
      createElement(ListingPrice, {
        minorAmount: "2400",
        compareAtMinorAmount: "4000",
        currency: "USD",
      }),
    );
    expect(paid).toContain("<del");
    expect(paid).toContain("$40.00");
    expect(paid).toContain("$24.00");
    const free = renderToStaticMarkup(
      createElement(ListingPrice, {
        minorAmount: "0",
        compareAtMinorAmount: "1000",
        currency: "USD",
      }),
    );
    expect(free).toContain("$10.00");
    expect(free).toContain(">Free</span>");
  });
});
