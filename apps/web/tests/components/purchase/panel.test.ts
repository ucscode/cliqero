import { describe, expect, it } from "vitest";
import { purchaseActions, purchaseStatusPresentation } from "@/components/purchase/panel";

describe("purchase status presentation", () => {
  it.each([
    ["pending", "Awaiting payment", "warning"],
    ["paid", "Paid", "default"],
    ["completed", "Completed", "default"],
    ["failed", "Payment failed", "destructive"],
    ["refunded", "Refunded", "secondary"],
  ] as const)("maps %s to its customer-facing status", (state, label, variant) => {
    expect(purchaseStatusPresentation(state)).toEqual({ label, variant });
  });

  it("keeps access and pending checkout actions without restoring duplicate details", () => {
    expect(
      purchaseActions({
        id: "purchase-1",
        listing_id: "listing-1",
        checkout_id: null,
        state: "completed",
        access_available: true,
      }),
    ).toEqual([{ label: "Open access", href: "/access/purchase-1" }]);
    expect(
      purchaseActions({
        id: "purchase-2",
        listing_id: "listing-2",
        checkout_id: "checkout-2",
        state: "pending",
        access_available: false,
      }),
    ).toEqual([
      {
        label: "Continue to checkout",
        href: "/dashboard?buy=listing-2&checkout=checkout-2",
      },
    ]);
    expect(
      purchaseActions({
        id: "purchase-3",
        listing_id: "listing-3",
        checkout_id: "checkout-3",
        state: "paid",
        access_available: false,
      }),
    ).toEqual([]);
  });
});
