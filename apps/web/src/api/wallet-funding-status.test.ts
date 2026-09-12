import { describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => fixtures.container,
}));

import { GET, customerFailureMessage } from "@/api/compat/wallet/fund/[id]/route";

const fundingId = "00000000-0000-4000-8000-000000000010";
const account = { id: "00000000-0000-4000-8000-000000000001" };

function configure(owner = account.id) {
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
    funding: {
      findById: vi.fn(async () => ({
        id: fundingId,
        accountId: owner,
        providerName: "development",
        providerReference: "dev-reference",
        canonicalAmount: { minorAmount: 1250n, currency: "USD" },
        collectionAmount: { minorAmount: 1250n, currency: "USD" },
        state: "awaiting_payment",
        providerInitialization: {
          authorizationUrl: "https://pay.example.test/continue",
          providerAccountSnapshot: {
            id: "account-1",
            fields: [{ key: "bank_name", label: "Bank", value: "Example Bank" }],
          },
          paymentAddress: "TReceiver",
          paymentAmount: "12.50",
          paymentCurrency: "USDT",
          network: "TRC20",
          instructions: "Send exactly 12.50 USDT.",
          expiresAt: "2026-09-11T14:00:00.000Z",
        },
      })),
    },
    providers: { displayName: vi.fn(() => "Development") },
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
      provider_display_name: "Development",
      funding_reference: "dev-reference",
      amount_minor: "1250",
      authorization_url: "https://pay.example.test/continue",
      provider_account_snapshot: {
        id: "account-1",
        fields: [{ key: "bank_name", label: "Bank", value: "Example Bank" }],
      },
      payment_address: "TReceiver",
      payment_amount: "12.50",
      payment_currency: "USDT",
      network: "TRC20",
      instructions: "Send exactly 12.50 USDT.",
      expires_at: "2026-09-11T14:00:00.000Z",
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

  it("formats a structured or legacy NOWPayments minimum in minor USD units", () => {
    expect(
      customerFailureMessage({
        providerInitialization: {
          failureCode: "AMOUNT_MINIMAL_ERROR",
          failureAmountMinor: "1915",
          failureCurrency: "USD",
          failureMessage: "The minimum funding amount is 1915 USD.",
        },
      }),
    ).toBe("The minimum funding amount is $19.15.");
    expect(
      customerFailureMessage({
        providerInitialization: {
          failureCode: "AMOUNT_MINIMAL_ERROR",
          failureMessage: "The minimum funding amount is 1915 USD.",
        },
      }),
    ).toBe("The minimum funding amount is $19.15.");
  });
});
