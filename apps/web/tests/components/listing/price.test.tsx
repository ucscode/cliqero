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
});
