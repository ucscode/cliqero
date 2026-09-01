import { describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => fixtures.container,
}));

import { GET } from "@/api/compat/wallet/fund/[id]/route";

const fundingId = "00000000-0000-4000-8000-000000000010";
const account = { id: "00000000-0000-4000-8000-000000000001" };

function configure(owner = account.id) {
  fixtures.container = {
    principalResolver: {
      resolve: vi.fn(async () => ({
        accountId: account.id,
        account,
        kind: "user_session",
        roles: [],
        scopes: new Set(),
      })),
    },
    funding: {
      findById: vi.fn(async () => ({
        id: fundingId,
        accountId: owner,
        providerName: "development",
        canonicalAmount: { minorAmount: 1250n, currency: "USD" },
        collectionAmount: { minorAmount: 1250n, currency: "USD" },
        state: "awaiting_payment",
        providerInitialization: { authorizationUrl: "https://pay.example.test/continue" },
      })),
    },
  };
}

describe("wallet funding status projection", () => {
  it("returns persisted funding state and provider next action", async () => {
    configure();
    const response = await GET(new Request(`http://localhost/api/wallet/fund/${fundingId}`), {
      params: Promise.resolve({ id: fundingId }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: fundingId,
      state: "awaiting_payment",
      amount_minor: "1250",
      authorization_url: "https://pay.example.test/continue",
    });
  });

  it("does not disclose another account's funding", async () => {
    configure("00000000-0000-4000-8000-000000000002");
    const response = await GET(new Request(`http://localhost/api/wallet/fund/${fundingId}`), {
      params: Promise.resolve({ id: fundingId }),
    });
    expect(response.status).toBe(404);
  });

  it("does not retain a provider authorization URL after confirmation", async () => {
    configure();
    fixtures.container.funding.findById = vi.fn(async () => ({
      id: fundingId,
      accountId: account.id,
      providerName: "development",
      canonicalAmount: { minorAmount: 1250n, currency: "USD" },
      collectionAmount: { minorAmount: 1250n, currency: "USD" },
      state: "confirmed",
      providerInitialization: { authorizationUrl: "https://pay.example.test/continue" },
    }));
    const response = await GET(new Request(`http://localhost/api/wallet/fund/${fundingId}`), {
      params: Promise.resolve({ id: fundingId }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).authorization_url).toBeNull();
  });
});
