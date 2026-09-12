import { describe, expect, it, vi } from "vitest";
import { Money } from "@/modules/money/money";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => fixtures.container,
}));

import { GET } from "@/api/compat/wallet/route";

const account = { id: "00000000-0000-4000-8000-000000000001" };
const activeFunding = {
  id: "00000000-0000-4000-8000-000000000010",
  accountId: account.id,
  providerName: "paystack",
  canonicalAmount: Money.of(1000n, "USD"),
  collectionAmount: Money.of(1600000n, "NGN"),
  state: "awaiting_payment",
  providerInitialization: { authorizationUrl: "https://paystack.example/continue" },
};

function configure(active: unknown) {
  fixtures.container = {
    principalResolver: {
      resolve: vi.fn(async () => ({
        accountId: account.id,
        account,
        kind: "user_session",
        capabilities: [],
        scopes: new Set(),
      })),
    },
    wallet: {
      summary: vi.fn(async () => ({
        currency: "USD",
        available: Money.of(205000n, "USD"),
        pending: Money.of(0n, "USD"),
      })),
    },
    funding: { findActiveForAccount: vi.fn(async () => active) },
  };
}

describe("wallet summary API contract", () => {
  it("projects current balance and active funding arrays", async () => {
    configure([activeFunding]);

    const response = await GET(new Request("http://localhost/api/wallet"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      currency: "USD",
      available_minor: "205000",
      pending_minor: "0",
      active_funding: {
        id: activeFunding.id,
        amount_minor: "1000",
        currency: "USD",
        authorization_url: "https://paystack.example/continue",
      },
      active_fundings: [
        expect.objectContaining({ id: activeFunding.id, state: "awaiting_payment" }),
      ],
    });
  });

  it("safely handles a legacy single funding result and malformed records", async () => {
    configure([activeFunding, { id: "malformed" }, null]);
    const response = await GET(new Request("http://localhost/api/wallet"));
    expect(response.status).toBe(200);
    expect((await response.json()).active_fundings).toHaveLength(1);

    configure(activeFunding);
    const legacyResponse = await GET(new Request("http://localhost/api/wallet"));
    expect(legacyResponse.status).toBe(200);
    expect((await legacyResponse.json()).active_fundings).toHaveLength(1);
  });
});
