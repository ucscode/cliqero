import { describe, expect, it } from "vitest";
import {
  PurchaseRefreshBudget,
  purchaseActions,
  purchaseAccessLabel,
  purchaseCardDescription,
  purchaseNeedsBackgroundRefresh,
  purchaseStatusPresentation,
} from "@/components/purchase/panel";

const accessPurchase = {
  id: "purchase-1",
  checkout_id: null,
  listing_id: "listing-1",
  title: "Listing",
  short_description: "",
  long_description: "",
  amount_minor: "100",
  currency: "USD",
  state: "paid" as const,
  created_at: "2026-09-01T00:00:00.000Z",
  entitlement_state: null as "active" | "consumed" | "revoked" | "expired" | null,
  entitlement_expires_at: null as string | null,
  access_available: false,
};

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

  it("uses the immutable short-description projection for purchase cards", () => {
    expect(
      purchaseCardDescription({
        short_description: "Original purchased summary",
      }),
    ).toBe("Original purchased summary");
  });
});

describe("purchase access presentation and refresh eligibility", () => {
  it.each([
    [{ ...accessPurchase, access_available: true }, "Ready to access"],
    [{ ...accessPurchase, entitlement_state: "consumed" as const }, "Used"],
    [{ ...accessPurchase, entitlement_state: "expired" as const }, "Access expired"],
    [{ ...accessPurchase, entitlement_state: "revoked" as const }, "Access revoked"],
    [
      {
        ...accessPurchase,
        entitlement_state: "active" as const,
        entitlement_expires_at: "2026-09-01T00:00:00.000Z",
      },
      "Access expired",
    ],
    [accessPurchase, "Access is being prepared"],
    [{ ...accessPurchase, state: "pending" as const }, "Complete payment to access"],
  ])("maps entitlement and purchase state to customer copy", (purchase, expected) => {
    expect(purchaseAccessLabel(purchase, Date.parse("2026-09-10T00:00:00.000Z"))).toBe(expected);
  });

  it.each(["consumed", "expired", "revoked"] as const)(
    "does not background-refresh terminal %s access",
    (entitlement_state) => {
      expect(
        purchaseNeedsBackgroundRefresh({
          state: "completed",
          entitlement_state,
        }),
      ).toBe(false);
    },
  );

  it("refreshes pending payment or paid purchases while access is being prepared", () => {
    expect(purchaseNeedsBackgroundRefresh({ state: "pending", entitlement_state: null })).toBe(
      true,
    );
    expect(purchaseNeedsBackgroundRefresh({ state: "paid", entitlement_state: null })).toBe(true);
    expect(
      purchaseNeedsBackgroundRefresh({ state: "completed", entitlement_state: "active" }),
    ).toBe(false);
  });

  it("keeps the retry budget exhausted across refreshed purchase arrays", () => {
    const budget = new PurchaseRefreshBudget(6);
    const pending = [{ state: "pending" as const, entitlement_state: null }];

    for (let refresh = 0; refresh < 8; refresh += 1) {
      expect(pending.some(purchaseNeedsBackgroundRefresh)).toBe(true);
      if (budget.hasRemaining) expect(budget.consume()).toBe(true);
    }

    expect(budget.hasRemaining).toBe(false);
    expect(budget.consume()).toBe(false);
  });
});
