import { describe, expect, it } from "vitest";
import { AccountReferralAttributionService } from "@/application/account-referral-attribution";

const uow = { transaction: async <T>(operation: () => Promise<T>) => operation() };

describe("AccountReferralAttributionService", () => {
  const referrer = "550e8400-e29b-41d4-a716-446655440000";
  it("creates opaque sliding-window attribution and resolves only valid account links", async () => {
    const created: Array<{ referrerAccountId: string; tokenHash: Buffer; expiresAt: Date }> = [];
    const service = new AccountReferralAttributionService(
      {
        createAccountAttribution: async (input) => {
          created.push(input);
        },
        resolveAccountAttribution: async () => ({ referrerAccountId: referrer }),
        claimAccountAttribution: async () => ({ referrerAccountId: referrer }),
        revokeAccountAttribution: async () => undefined,
      },
      { exists: async (accountId) => accountId === referrer },
      uow,
    );

    const visit = await service.visit(referrer);
    expect(visit?.source).toMatch(/^[A-Za-z0-9_-]{40,50}$/);
    expect(created).toHaveLength(1);
    expect(created[0].tokenHash).toHaveLength(32);
    expect(created[0].tokenHash.toString()).not.toBe(visit?.source);
    expect(created[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    await expect(service.resolve(undefined)).resolves.toBeNull();
    await expect(service.resolve(visit?.source)).resolves.toEqual({
      referrerAccountId: referrer,
    });
  });

  it("rejects nonexistent referrers and creates deterministic account URLs", async () => {
    const service = new AccountReferralAttributionService(
      {
        createAccountAttribution: async () => undefined,
        resolveAccountAttribution: async () => null,
        claimAccountAttribution: async () => null,
        revokeAccountAttribution: async () => undefined,
      },
      { exists: async (accountId) => accountId === "550e8400-e29b-41d4-a716-446655440000" },
      uow,
    );

    await expect(service.visit("not-an-account")).resolves.toBeNull();
    await expect(service.urlFor("not-an-account")).rejects.toThrow("Referral account not found");
  });
});
