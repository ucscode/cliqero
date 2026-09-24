import { describe, expect, it, vi } from "vitest";
import { newId } from "@/kernel/ids";
import { Money } from "@/modules/money/money";
import { Listing } from "@/modules/listing";
import type { ApplicationContainer } from "@/infrastructure/container";
import {
  assertDevelopmentDistributionEnvironment,
  DevelopmentDistributionScenario,
  formatDevelopmentDistributionReport,
  parseDistributionScenarioArguments,
} from "@/infrastructure/development/distribution-scenario";

const buyerId = "11111111-1111-4111-8111-111111111111";
const sellerId = "22222222-2222-4222-8222-222222222222";
const leftId = "33333333-3333-4333-8333-333333333333";
const centralId = "44444444-4444-4444-8444-444444444444";
const listingId = "55555555-5555-4555-8555-555555555555";

function createHarness() {
  const listing = Listing.create({
    id: listingId,
    sellerId,
    title: "Fixture listing",
    shortDescription: "A real checkout-backed test listing",
    longDescription: "Development scenario fixture.",
    price: Money.of(1200n, "USD"),
    destination: "https://example.test/access",
    externalKey: "toolkit-01",
  });
  listing.publish();

  let availableMinor = 700n;
  let invocation = 0;
  const ledgerEntries = [
    {
      id: newId(),
      distributionId: "distribution-persisted",
      accountId: sellerId,
      purchaseId: "purchase-persisted",
      entryType: "purchase-earnings" as const,
      direction: "credit" as const,
      amount: Money.of(800n, "USD"),
      idempotencyKey: "persisted-seller-entry",
      correlationId: newId(),
      recipientRole: "seller" as const,
      basis: "persisted-seller-basis",
      balanceState: "available" as const,
      createdAt: new Date(),
    },
    {
      id: newId(),
      distributionId: "distribution-persisted",
      accountId: leftId,
      purchaseId: "purchase-persisted",
      entryType: "purchase-earnings" as const,
      direction: "credit" as const,
      amount: Money.of(300n, "USD"),
      idempotencyKey: "persisted-level-one-entry",
      correlationId: newId(),
      recipientRole: "referral" as const,
      basis: "persisted-referral-basis",
      referralLevel: 1,
      balanceState: "pending" as const,
      createdAt: new Date(),
    },
    {
      id: newId(),
      distributionId: "distribution-persisted",
      accountId: null,
      purchaseId: "purchase-persisted",
      entryType: "purchase-earnings" as const,
      direction: "credit" as const,
      amount: Money.of(100n, "USD"),
      idempotencyKey: "persisted-platform-entry",
      correlationId: newId(),
      recipientRole: "platform" as const,
      basis: "persisted-platform-basis",
      balanceState: "available" as const,
      createdAt: new Date(),
    },
  ];

  const query = vi.fn(async (statement: string, values: readonly unknown[] = []) => {
    if (statement.includes("where username=$1")) {
      const usernames: Record<string, { id: string; username: string }> = {
        central_left_1: { id: buyerId, username: "central_left_1" },
        fixture_catalogue: { id: sellerId, username: "fixture_catalogue" },
        central_left: { id: leftId, username: "central_left" },
        central_user: { id: centralId, username: "central_user" },
      };
      const account = usernames[String(values[0])];
      return { rows: account ? [account] : [], rowCount: account ? 1 : 0 };
    }
    if (statement.includes("uuid = any"))
      return {
        rows: [
          { id: sellerId, username: "fixture_catalogue" },
          { id: leftId, username: "central_left" },
        ].filter((account) => (values[0] as string[]).includes(account.id)),
        rowCount: 2,
      };
    throw new Error(`Unexpected test query: ${statement}`);
  });

  const app = {
    database: { query },
    listings: {
      findById: vi.fn(async (id: string) => (id === listing.id ? listing : null)),
      findByExternalKey: vi.fn(async (owner: string, key: string) =>
        owner === sellerId && key === "toolkit-01" ? listing : null,
      ),
    },
    referralGraph: {
      getUplines: vi.fn(async () => [
        { accountId: leftId, depth: 1 },
        { accountId: centralId, depth: 2 },
      ]),
    },
    wallet: {
      summary: vi.fn(async () => ({
        currency: "USD" as const,
        available: Money.of(availableMinor, "USD"),
        pending: Money.of(0n, "USD"),
      })),
    },
    fundingService: {
      create: vi.fn(async (input: { amountMinor: bigint; providerName: string }) => {
        expect(input.providerName).toBe("development");
        expect(input.amountMinor).toBe(1200n);
        return { id: `funding-${++invocation}` };
      }),
    },
    fundingInitialization: {
      process: vi.fn(async (id: string) => ({ id, state: "awaiting_payment" })),
    },
    fundingVerification: {
      process: vi.fn(async (id: string) => ({ id, state: "confirmed" })),
    },
    walletCredit: { process: vi.fn(async () => ({ id: "credit-persisted" })) },
    walletAvailability: {
      process: vi.fn(async () => {
        availableMinor += 1200n;
      }),
    },
    walletRepository: { findCreditByFunding: vi.fn(async () => ({ id: "credit-persisted" })) },
    walletCheckout: {
      initiate: vi.fn(async (input: { listingId: string; idempotencyKey: string }) => ({
        id: `checkout-${invocation}`,
        buyerId,
        listingId: input.listingId,
        purchaseId: `purchase-${invocation}`,
        amount: Money.of(1200n, "USD"),
        state: "pending",
        idempotencyKey: input.idempotencyKey,
      })),
    },
    walletCheckoutPayment: {
      pay: vi.fn(async ({ checkoutId }: { checkoutId: string }) => {
        availableMinor -= 1200n;
        return {
          checkout: { id: checkoutId, state: "paid" },
          wallet: {
            currency: "USD",
            available: Money.of(availableMinor, "USD"),
            pending: Money.of(0n, "USD"),
          },
          shortfall: Money.of(0n, "USD"),
        };
      }),
    },
    purchases: {
      findById: vi.fn(async (id: string) => ({
        id,
        buyerId,
        paymentId: null,
        checkoutId: id.replace("purchase-", "checkout-"),
        terms: { listingId, sellerId, canonicalPrice: { minorAmount: "1200", currency: "USD" } },
        idempotencyKey: `purchase:${id}`,
        state: "paid",
      })),
    },
    entitlementIssuance: { process: vi.fn(async () => ({ id: "entitlement-persisted" })) },
    purchaseDistribution: {
      process: vi.fn(async ({ purchaseId }: { purchaseId: string }) => ({
        id: `distribution-${purchaseId}`,
        purchaseId,
      })),
    },
    ledger: {
      findDistributionByPurchaseId: vi.fn(async (purchaseId: string) => ({
        id: `distribution-${purchaseId}`,
      })),
      findEntriesByPurchaseId: vi.fn(async (purchaseId: string) =>
        ledgerEntries.map((entry) => ({
          ...entry,
          distributionId: `distribution-${purchaseId}`,
          purchaseId,
        })),
      ),
    },
  };

  return { app: app as unknown as ApplicationContainer, listing, query, ledgerEntries };
}

describe("development distribution scenario", () => {
  it("refuses non-development execution and validates UUID-only explicit listing selection", () => {
    expect(() => assertDevelopmentDistributionEnvironment("production")).toThrow(
      "requires NODE_ENV=development",
    );
    expect(assertDevelopmentDistributionEnvironment("development")).toBeUndefined();
    expect(parseDistributionScenarioArguments([])).toEqual({ buyerUsername: "central_left_1" });
    expect(parseDistributionScenarioArguments(["central_right_1", listingId])).toEqual({
      buyerUsername: "central_right_1",
      listingId,
    });
    expect(() => parseDistributionScenarioArguments(["central_right_1", "toolkit-01"])).toThrow(
      "listing must be identified by its UUID",
    );
  });

  it("resolves the seeded seller/key, funds exact price, uses wallet checkout and reports persisted ledger rows", async () => {
    const { app, query } = createHarness();
    const scenario = new DevelopmentDistributionScenario(app, "development");
    const result = await scenario.run({ buyerUsername: "central_left_1" });

    expect(query).toHaveBeenCalledWith(expect.stringContaining("where username=$1"), [
      "central_left_1",
    ]);
    expect(app.listings.findByExternalKey).toHaveBeenCalledWith(sellerId, "toolkit-01");
    expect(result.listing.id).toBe(listingId);
    expect(app.fundingService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: buyerId,
        amountMinor: 1200n,
        providerName: "development",
      }),
    );
    expect(app.fundingInitialization.process).toHaveBeenCalledOnce();
    expect(app.fundingVerification.process).toHaveBeenCalledOnce();
    expect(app.walletCredit.process).toHaveBeenCalledOnce();
    expect(app.walletAvailability.process).toHaveBeenCalledWith("credit-persisted");
    expect(app.walletCheckout.initiate).toHaveBeenCalledWith(
      expect.objectContaining({ buyerId, listingId, idempotencyKey: expect.any(String) }),
    );
    expect(app.walletCheckoutPayment.pay).toHaveBeenCalledOnce();
    expect(app.purchases.findById).toHaveBeenCalledWith("purchase-1");
    expect(app.entitlementIssuance.process).toHaveBeenCalledWith("purchase-1");
    expect(app.purchaseDistribution.process).toHaveBeenCalledWith(
      expect.objectContaining({ purchaseId: "purchase-1", correlationId: expect.any(String) }),
    );
    expect(app.ledger.findEntriesByPurchaseId).toHaveBeenCalledWith("purchase-1");
    expect(result.wallet).toMatchObject({
      before: "$7.00",
      funded: "+$12.00",
      purchase: "-$12.00",
      after: "$7.00",
      netChange: "$0.00",
    });
    expect(result.entries).toEqual([
      {
        label: "Seller",
        username: "fixture_catalogue",
        amount: "$8.00",
        balanceState: "available",
      },
      { label: "Level 1", username: "central_left", amount: "$3.00", balanceState: "pending" },
      { label: "Platform", username: "Platform", amount: "$1.00", balanceState: "available" },
    ]);
    const rendered = formatDevelopmentDistributionReport(result);
    expect(rendered).toContain("Level 1      central_left");
    expect(rendered).toContain("(pending)");
    expect(rendered).not.toContain("persisted-platform-basis");
  });

  it("fails clearly for a missing buyer and does not start funding", async () => {
    const { app, query } = createHarness();
    query.mockImplementation(async (statement: string, values: readonly unknown[] = []) => {
      if (statement.includes("where username=$1") && values[0] === "missing_user")
        return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    await expect(
      new DevelopmentDistributionScenario(app, "development").run({
        buyerUsername: "missing_user",
      }),
    ).rejects.toThrow("Run just seed-users first");
    expect(app.fundingService.create).not.toHaveBeenCalled();
  });

  it("fails clearly when an explicit listing UUID does not resolve", async () => {
    const { app } = createHarness();
    await expect(
      new DevelopmentDistributionScenario(app, "development").run({
        buyerUsername: "central_left_1",
        listingId: "66666666-6666-4666-8666-666666666666",
      }),
    ).rejects.toThrow("Published listing");
    expect(app.fundingService.create).not.toHaveBeenCalled();
  });

  it("uses arbitrary listing UUIDs and creates new checkout/purchase/distribution identities per run", async () => {
    const { app } = createHarness();
    const scenario = new DevelopmentDistributionScenario(app, "development");
    const first = await scenario.run({ buyerUsername: "central_left_1", listingId });
    const second = await scenario.run({ buyerUsername: "central_left_1", listingId });
    expect(app.listings.findById).toHaveBeenCalledWith(listingId);
    expect(first.purchaseId).not.toBe(second.purchaseId);
    expect(first.distributionId).not.toBe(second.distributionId);
    expect(vi.mocked(app.fundingService.create).mock.calls[0][0].idempotencyKey).not.toBe(
      vi.mocked(app.fundingService.create).mock.calls[1][0].idempotencyKey,
    );
    expect(vi.mocked(app.walletCheckout.initiate).mock.calls[0][0].idempotencyKey).not.toBe(
      vi.mocked(app.walletCheckout.initiate).mock.calls[1][0].idempotencyKey,
    );
  });
});
