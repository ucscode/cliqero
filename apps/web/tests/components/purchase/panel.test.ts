import { describe, expect, it } from "vitest";
import { purchaseStatusPresentation } from "@/components/purchase/panel";

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
});
