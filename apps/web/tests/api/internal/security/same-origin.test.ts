import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "@/api/internal/security/same-origin";

describe("isSameOriginRequest", () => {
  it("accepts the browser origin when Next is bound behind a forwarded host", () => {
    const request = new Request("http://0.0.0.0:3000/internal/funding", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
        "x-forwarded-host": "localhost:3000",
        "x-forwarded-proto": "http",
        "sec-fetch-site": "same-origin",
      },
    });

    expect(isSameOriginRequest(request)).toBe(true);
  });

  it("uses the first forwarded origin in a proxy chain", () => {
    const request = new Request("http://0.0.0.0:3000/internal/funding", {
      method: "POST",
      headers: {
        origin: "https://cliqero.example",
        host: "internal:3000",
        "x-forwarded-host": "cliqero.example, proxy.internal",
        "x-forwarded-proto": "https, http",
        "sec-fetch-site": "same-origin",
      },
    });

    expect(isSameOriginRequest(request)).toBe(true);
  });

  it("rejects missing or mismatched origins and cross-origin fetch metadata", () => {
    const base = {
      host: "localhost:3000",
      "x-forwarded-host": "localhost:3000",
      "x-forwarded-proto": "http",
    };

    expect(
      isSameOriginRequest(new Request("http://0.0.0.0:3000/internal/funding", { headers: base })),
    ).toBe(false);
    expect(
      isSameOriginRequest(
        new Request("http://0.0.0.0:3000/internal/funding", {
          headers: { ...base, origin: "https://attacker.example" },
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginRequest(
        new Request("http://0.0.0.0:3000/internal/funding", {
          headers: { ...base, origin: "http://localhost:3000", "sec-fetch-site": "cross-site" },
        }),
      ),
    ).toBe(false);
  });
});
