import { describe, expect, it, vi } from "vitest";
import type { ApplicationContainer } from "@/infrastructure/container";
import { CommercialWorkflowDispatcher } from "@/workers/commercial/dispatcher";
describe("CommercialWorkflowDispatcher failure isolation", () => {
  function application(events: string[]) {
    const items = (prefix: string) => [{ id: `${prefix}-poison` }, { id: `${prefix}-healthy` }],
      processing = (family: string) => async (id: string) => {
        events.push(`${family}:${id}`);
        if (id.endsWith("poison")) throw new Error(`${family} failed`);
      };
    return {
      funding: {
        findWork: async (state: string) =>
          state === "verification_pending" ? items("verification") : items("funding"),
      },
      providers: { get: () => ({}) },
      fundingVerification: { process: processing("verification") },
      fundingExpiry: {
        findWork: async () => items("expiry"),
        process: processing("expiry"),
      },
      walletCredit: { process: processing("wallet-credit") },
      walletRepository: {
        findFundingCreditWork: async () => items("funding"),
        findPendingCredits: async () => items("credit"),
      },
      walletAvailability: { process: processing("wallet-availability") },
      purchases: {
        findCompletedWithoutEntitlement: async () => items("entitlement"),
        findCompletedWithoutDistribution: async () => items("distribution"),
      },
      entitlementIssuance: { process: processing("entitlement") },
      purchaseDistribution: {
        process: async ({ purchaseId }: { purchaseId: string }) =>
          processing("distribution")(purchaseId),
      },
      listingMediaDeletion: { findWork: async () => items("media"), process: processing("media") },
      treasuryProcessor: {
        findWork: async () => items("treasury"),
        process: processing("treasury"),
      },
    } as unknown as ApplicationContainer;
  }
  it("continues past poison items and across every processor family", async () => {
    const events: string[] = [],
      logger = { error: vi.fn() };
    expect(await new CommercialWorkflowDispatcher(application(events), logger).runOnce()).toBe(8);
    for (const family of [
      "expiry",
      "verification",
      "wallet-credit",
      "wallet-availability",
      "entitlement",
      "distribution",
      "media",
      "treasury",
    ])
      expect(events).toContain(
        `${family}:${family === "wallet-credit" ? "funding" : family === "wallet-availability" ? "credit" : family}-healthy`,
      );
    expect(logger.error).toHaveBeenCalledTimes(8);
  });
  it("continues to unrelated families when discovery fails", async () => {
    const events: string[] = [],
      app = application(events);
    app.fundingExpiry.findWork = async () => {
      throw new Error("discovery unavailable");
    };
    const logger = { error: vi.fn() };
    await new CommercialWorkflowDispatcher(app, logger).runOnce();
    expect(events).toContain("verification:verification-healthy");
    expect(events).toContain("distribution:distribution-healthy");
  });

  it("stops the iteration on a database outage so the worker backs off once", async () => {
    const events: string[] = [];
    const app = application(events);
    app.fundingExpiry.findWork = async () => {
      throw Object.assign(new Error("getaddrinfo EAI_AGAIN postgres"), { code: "EAI_AGAIN" });
    };
    const logger = { error: vi.fn() };
    await expect(new CommercialWorkflowDispatcher(app, logger).runOnce()).rejects.toMatchObject({
      name: "WorkerInfrastructureError",
      family: "funding-expiry",
    });
    expect(logger.error).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("does not automatically verify providers that require manual confirmation", async () => {
    const events: string[] = [];
    const app = application(events);
    app.providers.get = (providerName: string) =>
      ({
        name: providerName,
        displayName: providerName,
        imageUrl: "",
        description: "",
        automatedVerification: providerName === "bank_transfer" ? false : undefined,
        initiate: vi.fn(),
        verify: vi.fn(),
      }) as any;
    app.funding.findWork = async (state: string) =>
      state === "verification_pending"
        ? ([{ id: "bank-manual", providerName: "bank_transfer" }] as any)
        : [];

    await new CommercialWorkflowDispatcher(app, { error: vi.fn() }).runOnce();

    expect(events).not.toContain("verification:bank-manual");
  });

  it("discovers only verification work that is due", async () => {
    const events: string[] = [];
    const app = application(events);
    const findVerificationWork = vi.fn(async (now: Date) => {
      expect(now.toISOString()).toBe("2026-09-18T10:00:00.000Z");
      return [{ id: "due-funding", providerName: "test-provider" }] as any;
    });
    app.funding.findVerificationWork = findVerificationWork;
    app.funding.findWork = vi.fn(async () => {
      throw new Error("state-only verification discovery must not be used");
    });
    app.fundingVerification.process = async (id: string) => {
      events.push(`verification:${id}`);
      return null;
    };

    await new CommercialWorkflowDispatcher(
      app,
      { error: vi.fn() },
      undefined,
      () => new Date("2026-09-18T10:00:00.000Z"),
    ).runOnce();

    expect(findVerificationWork).toHaveBeenCalledOnce();
    expect(events).toContain("verification:due-funding");
  });

  it("does not rediscover a still-pending funding before its next eligibility time", async () => {
    const events: string[] = [];
    const app = application(events);
    const now = new Date("2026-09-18T10:00:00.000Z");
    let nextVerificationAt: Date | null = null;
    let providerCalls = 0;
    app.funding.findVerificationWork = vi.fn(async (at: Date) =>
      !nextVerificationAt || nextVerificationAt <= at
        ? ([{ id: "pending-funding", providerName: "test-provider" }] as any)
        : [],
    );
    app.fundingVerification.process = async (id: string) => {
      providerCalls++;
      events.push(`verification:${id}`);
      nextVerificationAt = new Date(now.getTime() + 5_000);
      return null;
    };
    const dispatcher = new CommercialWorkflowDispatcher(
      app,
      { error: vi.fn() },
      undefined,
      () => now,
    );

    await dispatcher.runOnce();
    await dispatcher.runOnce();

    expect(providerCalls).toBe(1);
    expect(events.filter((event) => event.startsWith("verification:"))).toEqual([
      "verification:pending-funding",
    ]);
  });
});
