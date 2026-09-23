import { describe, expect, it } from "vitest";
import { isCanonicalApplicationSession } from "@/lib/application-session";

describe("canonical application session", () => {
  it("accepts only a linked account session projection", () => {
    expect(
      isCanonicalApplicationSession({
        authenticated: true,
        account: { id: "account-1", username: "ordinary" },
      }),
    ).toBe(true);
    expect(isCanonicalApplicationSession({ authenticated: true, account: null })).toBe(false);
    expect(isCanonicalApplicationSession({ authenticated: false, account: {} })).toBe(false);
    expect(isCanonicalApplicationSession(null)).toBe(false);
  });
});
