import { describe, expect, it } from "vitest";
import { Money } from "./money";

describe("Money", () => {
  it("preserves exact minor units without floating point arithmetic", () => {
    expect(Money.of(500000n, "ngn").snapshot()).toEqual({ minorAmount: "500000", currency: "NGN" });
  });

  it("rejects negative amounts", () => {
    expect(() => Money.of(-1n, "USD")).toThrow("Money cannot be negative");
  });
});

