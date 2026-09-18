import { describe, expect, it } from "vitest";
import { checkoutStatusPresentation } from "@/components/checkout/flow";

describe("checkout status presentation", () => {
  it.each([
    ["awaiting_funds", "Awaiting funds", "warning"],
    ["paid", "Paid", "default"],
    ["failed", "Payment failed", "destructive"],
  ] as const)("maps %s to customer-safe status presentation", (state, label, variant) => {
    expect(checkoutStatusPresentation(state)).toEqual({ label, variant });
  });
});
