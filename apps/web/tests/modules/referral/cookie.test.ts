import { describe, expect, it } from "vitest";
import {
  ACCOUNT_REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE,
  clearReferralCookieHeader,
  referralCookieHeader,
} from "@/modules/referral/cookie";

describe("account referral cookies", () => {
  it("uses an opaque HttpOnly sliding-window cookie", () => {
    const header = referralCookieHeader(ACCOUNT_REFERRAL_COOKIE, "opaque-token");
    expect(header).toContain("cliqero_referrer=opaque-token");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).toContain(`Max-Age=${REFERRAL_COOKIE_MAX_AGE}`);
    expect(header).not.toContain("550e8400");
  });

  it("clears only the account-referral cookie after account creation", () => {
    expect(clearReferralCookieHeader(ACCOUNT_REFERRAL_COOKIE)).toContain("cliqero_referrer=;");
    expect(clearReferralCookieHeader(ACCOUNT_REFERRAL_COOKIE)).toContain("Max-Age=0");
  });
});
