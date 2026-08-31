import { describe, expect, it } from "vitest";
import { formatMinorUsd, safeContinuation } from "./api-client";

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
});
