import { describe, expect, it } from "vitest";
import { CountryCurrencyResolver, loadCountryCurrencyResolver } from "./country-currency";

describe("country currency resolution", () => {
  const resolver = new CountryCurrencyResolver({ NG: "NGN", US: "USD", GB: "GBP" });

  it("loads the shared reference mapping", () => {
    expect(loadCountryCurrencyResolver().resolve("NG", { provider: { enabled: true } })).toBe(
      "NGN",
    );
  });

  it("uses USD when mapping is disabled or absent", () => {
    expect(resolver.resolve("NG")).toBe("USD");
    expect(resolver.resolve("NG", { provider: { enabled: false } })).toBe("USD");
    expect(resolver.resolve("ZZ", { provider: { enabled: true } })).toBe("USD");
  });

  it("resolves mapped countries and applies provider then account overrides", () => {
    expect(resolver.resolve("NG", { provider: { enabled: true } })).toBe("NGN");
    expect(resolver.resolve("NG", { provider: { enabled: true, overrides: { NG: "GBP" } } })).toBe(
      "GBP",
    );
    expect(
      resolver.resolve("NG", {
        provider: { enabled: true, overrides: { NG: "GBP" } },
        account: { enabled: true, overrides: { NG: "USD" } },
      }),
    ).toBe("USD");
  });

  it("validates ISO-style reference and override values", () => {
    expect(() => new CountryCurrencyResolver({ NGA: "NGN" })).toThrow();
    expect(() =>
      resolver.resolve("NG", { provider: { enabled: true, overrides: { NG: "naira" } } }),
    ).toThrow();
  });
});
