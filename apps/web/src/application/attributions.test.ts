import { describe, expect, it, vi } from "vitest";
import { ReferralAttributionService } from "./attributions";

describe("referral link ownership", () => {
  it("lists only the links for the requested promoter account", async () => {
    const listLinks = vi.fn(async (accountId: string) => [
      {
        id: `${accountId}-link`,
        code: "public-code",
        listingId: "00000000-0000-4000-8000-000000000001",
        referrerAccountId: accountId,
        state: "active" as const,
      },
    ]);
    const service = new ReferralAttributionService(
      { listLinks } as never,
      { findById: vi.fn() } as never,
    );

    const links = await service.listLinks("account-a");

    expect(listLinks).toHaveBeenCalledWith("account-a");
    expect(links).toEqual([
      expect.objectContaining({ id: "account-a-link", referrerAccountId: "account-a" }),
    ]);
    expect(links).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "account-b-link" })]),
    );
  });
});
