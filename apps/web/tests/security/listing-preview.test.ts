import { afterEach, describe, expect, it } from "vitest";
import {
  createListingPreviewToken,
  LISTING_PREVIEW_LIFETIME_SECONDS,
  verifyListingPreviewToken,
} from "@/security/listing-preview";

const previousSecret = process.env.BETTER_AUTH_SECRET;

describe("listing preview tokens", () => {
  afterEach(() => {
    if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previousSecret;
  });

  it("binds a short-lived token to one listing and purpose", () => {
    process.env.BETTER_AUTH_SECRET = "preview-test-secret";
    const now = Date.UTC(2026, 0, 1);
    const token = createListingPreviewToken("listing-a", now);

    expect(verifyListingPreviewToken(token, "listing-a", now)).toBe(true);
    expect(verifyListingPreviewToken(token, "listing-b", now)).toBe(false);
    expect(
      verifyListingPreviewToken(
        token,
        "listing-a",
        now + (LISTING_PREVIEW_LIFETIME_SECONDS + 1) * 1000,
      ),
    ).toBe(false);
  });

  it("rejects malformed or tampered tokens", () => {
    process.env.BETTER_AUTH_SECRET = "preview-test-secret";
    const token = createListingPreviewToken("listing-a", Date.UTC(2026, 0, 1));
    const [payload, signature] = token.split(".");

    expect(verifyListingPreviewToken("not-a-token", "listing-a")).toBe(false);
    expect(verifyListingPreviewToken(`${payload}x.${signature}`, "listing-a")).toBe(false);
  });
});
