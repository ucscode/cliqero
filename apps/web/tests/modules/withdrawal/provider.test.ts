import { describe, expect, it } from "vitest";
import { DevelopmentPayoutProvider, PayoutProviderRegistry } from "@/modules/withdrawal/provider";

describe("payout provider configuration failures", () => {
  it("keeps unrelated development payout available while failing the broken provider clearly", () => {
    const registry = new PayoutProviderRegistry()
      .register(new DevelopmentPayoutProvider())
      .registerFailure("paystack", new Error("invalid Paystack payout configuration"));

    expect(() => registry.get("paystack")).toThrow(
      "Payout provider configuration is invalid: paystack",
    );
    expect(registry.get("development").name).toBe("development");
  });
});
