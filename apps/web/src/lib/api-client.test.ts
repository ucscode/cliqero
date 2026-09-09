import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiClientError,
  apiFetch,
  formatMinorUsd,
  minorToUsdInput,
  parseUsdMinor,
  presentFormApiError,
  safeContinuation,
} from "./api-client";
import { HONEYPOT_HEADER_NAME } from "./honeypot";

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

describe("apiFetch validation errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("retains the API's human-readable field errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: "Username must use 3–32 lowercase letters, numbers, _ or -",
            code: "validation_error",
            fields: { username: "Username must use 3–32 lowercase letters, numbers, _ or -" },
          },
          { status: 400 },
        ),
      ),
    );

    await expect(apiFetch("/api/me/onboarding")).rejects.toMatchObject({
      name: ApiClientError.name,
      code: "validation_error",
      fields: { username: "Username must use 3–32 lowercase letters, numbers, _ or -" },
    });
  });

  it("does not scan unrelated forms for anti-abuse data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    const querySelectorAll = vi.fn().mockReturnValue([{ value: "autofilled" }]);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("document", { querySelectorAll });

    await apiFetch("/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "user@example.com" }),
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("x-cliqero-honeypot")).toBeNull();
    expect(querySelectorAll).not.toHaveBeenCalled();
    expect(JSON.parse(String(init.body))).toEqual({ email: "user@example.com" });
  });

  it("preserves an explicitly owned trap header instead of consulting another form", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("document", {
      querySelectorAll: vi.fn().mockReturnValue([{ value: "another-form" }]),
    });

    await apiFetch("/api/test", {
      method: "POST",
      headers: { [HONEYPOT_HEADER_NAME]: "submitting-form" },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("x-cliqero-honeypot")).toBe("submitting-form");
  });
});

describe("form API error presentation", () => {
  it("keeps errors for fields that the form renders at those fields", () => {
    const error = new ApiClientError("Invalid username", 400, "validation_error", {
      username: "That username is already taken.",
    });

    expect(presentFormApiError(error, ["username", "email"])).toEqual({
      fields: { username: "That username is already taken." },
      message: null,
    });
  });

  it("makes an unmapped structured error visible without exposing its field or schema message", () => {
    const error = new ApiClientError(
      "Invalid input: expected string, received null",
      400,
      "validation_error",
      { captchaToken: "Invalid input: expected string, received null" },
    );

    expect(presentFormApiError(error, ["username", "email"])).toEqual({
      fields: {},
      message: "Please check your details and try again.",
    });
  });
});
