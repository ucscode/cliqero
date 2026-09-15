import { describe, expect, it } from "vitest";
import { parsePaymentProviderFilters, paymentProviderFiltersSchema } from "@/modules/payment";

describe("payment provider configuration convention", () => {
  it("defaults missing filters to unrestricted provider visibility", () => {
    expect(parsePaymentProviderFilters(undefined, "provider.yaml")).toEqual({ countries: null });
    expect(paymentProviderFiltersSchema.parse({ countries: null })).toEqual({ countries: null });
  });

  it("validates uppercase ISO alpha-2 provider country filters", () => {
    expect(parsePaymentProviderFilters({ countries: ["NG", "GH"] }, "provider.yaml")).toEqual({
      countries: ["NG", "GH"],
    });
    expect(() => parsePaymentProviderFilters({ countries: ["Nigeria"] }, "provider.yaml")).toThrow(
      "filters.countries must use uppercase ISO alpha-2 codes",
    );
  });
});
