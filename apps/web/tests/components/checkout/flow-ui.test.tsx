import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Listing } from "@/lib/api-client";
import { CheckoutFlow } from "@/components/checkout/flow";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const listing = (minorAmount: string): Listing => ({
  id: "listing-1",
  title: "Sample listing",
  short_description: "A useful item",
  long_description: "Details",
  test_only: null,
  price: { minor_amount: minorAmount, currency: "USD" },
  metadata: {},
  rating: null,
  media: [],
});

describe("CheckoutFlow price modes", () => {
  it("offers free access without wallet or payment prerequisites", () => {
    const html = renderToStaticMarkup(createElement(CheckoutFlow, { listing: listing("0") }));
    expect(html).toContain(">Free</span>");
    expect(html).toContain(">Get free</button>");
    expect(html).toContain("No payment or wallet balance is required.");
    expect(html).not.toContain("Available wallet balance");
    expect(html).not.toContain("Fund wallet");
    expect(html).not.toContain("Your wallet balance covers this purchase.");
    expect(html).not.toContain("$0.00");
  });

  it("retains wallet funding and payment presentation for paid listings", () => {
    const html = renderToStaticMarkup(createElement(CheckoutFlow, { listing: listing("1250") }));
    expect(html).toContain("$12.50");
    expect(html).toContain("Available wallet balance");
    expect(html).toContain("Pay now");
  });
});
