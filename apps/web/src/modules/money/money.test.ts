import { describe, expect, it } from "vitest";
import { formatMinorMoney, Money } from "./money";
import { formatExchangeRate } from "@/lib/api-client";

describe("minor-unit money formatting", () => {
  it.each([
    [1915n, "$19.15"],
    [2000n, "$20.00"],
    [123456789012345n, "$1,234,567,890,123.45"],
  ])("formats %s USD as %s", (minor, expected) => {
    expect(formatMinorMoney(Money.of(minor, "USD"))).toBe(expected);
  });

  it("keeps non-USD collection units explicit", () => {
    expect(formatMinorMoney(Money.of(12800000n, "NGN"))).toBe("NGN 128,000.00");
  });

  it("rounds customer-facing exchange rates without changing conversion precision", () => {
    expect(formatExchangeRate("1326.58674488", "NGN")).toBe("NGN 1,326.59");
    expect(formatExchangeRate("19.995", "USD")).toBe("USD 20.00");
  });
});
