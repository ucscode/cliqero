import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accountVisit: vi.fn(),
  listingVisit: vi.fn(),
}));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => ({
    accountReferralAttribution: { visit: mocks.accountVisit },
    referralAttribution: { visit: mocks.listingVisit },
  }),
}));

import { GET as accountReferral } from "@/app/r/[referrer]/route";
import { GET as listingReferral } from "@/app/r/[referrer]/[listing]/route";

describe("public referral routes", () => {
  it("sets an opaque account cookie and redirects direct invitations to registration", async () => {
    mocks.accountVisit.mockResolvedValueOnce({ source: "opaque-account-token" });
    const response = await accountReferral(
      new Request("http://localhost:3000/r/550e8400-e29b-41d4-a716-446655440000"),
      { params: Promise.resolve({ referrer: "550e8400-e29b-41d4-a716-446655440000" }) },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/register");
    expect(response.headers.get("set-cookie")).toContain("cliqero_referrer=opaque-account-token");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("rejects an invalid direct referral without setting a cookie", async () => {
    mocks.accountVisit.mockResolvedValueOnce(null);
    const response = await accountReferral(new Request("http://localhost:3000/r/not-an-account"), {
      params: Promise.resolve({ referrer: "not-an-account" }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("keeps product and account attribution cookies independent", async () => {
    mocks.listingVisit.mockResolvedValueOnce({ listingId: "listing-id", source: "listing-token" });
    mocks.accountVisit.mockResolvedValueOnce({ source: "account-token" });
    const response = await listingReferral(
      new Request("http://localhost:3000/r/referrer/listing", {
        headers: { cookie: "cliqero_referrer=old-account-token" },
      }),
      {
        params: Promise.resolve({ referrer: "referrer", listing: "listing" }),
      },
    );

    expect(response.status).toBe(307);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("cliqero_attribution=listing-token");
    expect(cookie).toContain("cliqero_referrer=account-token");
    expect(mocks.accountVisit).toHaveBeenLastCalledWith("referrer", "old-account-token");
  });
});
