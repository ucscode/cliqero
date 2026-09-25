import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Purchase, PurchasePage } from "@/lib/api-client";
import { OverviewPurchasesCard } from "@/components/dashboard/overview";

function purchase(id: string, title: string): Purchase {
  return {
    id,
    checkout_id: null,
    listing_id: "listing-" + id,
    title,
    short_description: "",
    long_description: "",
    amount_minor: "100",
    currency: "USD",
    state: "completed",
    created_at: "2026-09-20T12:00:00.000Z",
    entitlement_state: "active",
    entitlement_expires_at: null,
    access_available: true,
  };
}

function page(items: Purchase[]): PurchasePage {
  return { items, nextCursor: null };
}

describe("dashboard recent purchases card", () => {
  it("shows an empty collection without presenting an item count", () => {
    const markup = renderToStaticMarkup(
      createElement(OverviewPurchasesCard, { purchases: page([]) }),
    );

    expect(markup).toContain("Your collection");
    expect(markup).toContain("No purchases yet.");
    expect(markup).toContain("View purchases");
    expect(markup).not.toContain(">0<");
  });

  it("shows the latest purchase rather than treating a three-item page as a total", () => {
    const markup = renderToStaticMarkup(
      createElement(OverviewPurchasesCard, {
        purchases: page([
          purchase("newest", "Latest workbook"),
          purchase("older-1", "Earlier guide"),
          purchase("older-2", "First template"),
        ]),
      }),
    );

    expect(markup).toContain("Latest workbook");
    expect(markup).not.toContain("Earlier guide");
    expect(markup).not.toContain(">3<");
    expect(markup).toContain("View purchases");
  });

  it("distinguishes unavailable data from an empty collection", () => {
    const markup = renderToStaticMarkup(createElement(OverviewPurchasesCard, { purchases: null }));

    expect(markup).toContain("Recent purchases are unavailable.");
    expect(markup).not.toContain("No purchases yet.");
  });
});
