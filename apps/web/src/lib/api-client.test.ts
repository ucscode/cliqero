import { describe, expect, it } from "vitest";
import { formatMinorUsd, minorToUsdInput, parseUsdMinor, safeContinuation } from "./api-client";

describe("frontend API presentation helpers", () => {
  it("formats canonical USD minor units without floating point arithmetic", () => {
    expect(formatMinorUsd("1")).toBe("$0.01");
    expect(formatMinorUsd("100")).toBe("$1.00");
    expect(formatMinorUsd("1000")).toBe("$10.00");
    expect(formatMinorUsd("12345678901")).toBe("$123,456,789.01");
    expect(formatMinorUsd("-5")).toBe("-$0.05");
  });

  it("only accepts internal continuation paths", () => {
    expect(safeContinuation("/listings/listing-1?buy=1", "/")).toBe("/listings/listing-1?buy=1");
    expect(safeContinuation("https://evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeContinuation("//evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeContinuation("\\\\evil.example", "/dashboard")).toBe("/dashboard");
    const encoded = new URL("https://cliqero.test/login?next=%2F%2Fevil.example").searchParams.get(
      "next",
    );
    expect(safeContinuation(encoded, "/dashboard")).toBe("/dashboard");
    expect(safeContinuation(null, "/dashboard")).toBe("/dashboard");
  });

  it("parses USD input into exact positive minor units", () => {
    expect(parseUsdMinor("1")).toBe("100");
    expect(parseUsdMinor("1.00")).toBe("100");
    expect(parseUsdMinor("0.01")).toBe("1");
    expect(parseUsdMinor("$20.5")).toBe("2050");
    expect(() => parseUsdMinor("0")).toThrow();
    expect(() => parseUsdMinor("-1")).toThrow();
    expect(() => parseUsdMinor("1.001")).toThrow();
    expect(() => parseUsdMinor("one dollar")).toThrow();
  });

  it("converts minor units to an editable decimal without Number precision loss", () => {
    expect(minorToUsdInput("1000")).toBe("10.00");
    expect(minorToUsdInput("123456789012345678901")).toBe("1234567890123456789.01");
  });
});
