import { describe, expect, it } from "vitest";
import { referralAccountPath, referralAccountUrl } from "@/modules/referral/url";

describe("account referral URLs", () => {
  it("uses the immutable account identifier and the direct route", () => {
    const accountId = "550e8400-e29b-41d4-a716-446655440000";
    expect(referralAccountPath(accountId)).toBe(`/r/${accountId}`);
    expect(referralAccountUrl(accountId)).toContain(`/r/${accountId}`);
  });
});
