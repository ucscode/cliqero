import { describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => fixtures.container,
}));

import { GET, customerFailureMessage } from "@/api/compat/wallet/fund/[id]/route";

const fundingId = "00000000-0000-4000-8000-000000000010";
const account = { id: "00000000-0000-4000-8000-000000000001" };

function configure(owner = account.id, state = "awaiting_payment", providerName = "development") {
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
        providerName,
        providerReference: "dev-reference",
        canonicalAmount: { minorAmount: 1250n, currency: "USD" },
        collectionAmount: { minorAmount: 1250n, currency: "USD" },
        conversionSnapshot: {
          fromCurrency: "USD",
          toCurrency: "NGN",
          rate: "1326.475",
          source: "private-rate-source",
          sourceDate: "2026-09-13",
          observedAt: new Date("2026-09-13T08:00:00.000Z"),
        },
        state,
        providerInitialization: {
          authorizationUrl: "https://pay.example.test/continue",
          providerAccountSnapshot: {
            id: "account-1",
            collectionCurrency: "NGN",
            instruction: "Use the account instruction.",
            fields: [
              { key: "bank_name", label: "Bank", value: "Example Bank", copyable: false },
              { key: "routing", label: "Routing", value: "ROUTE-1", copyable: true },
            ],
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
    const body = await response.json();
    expect(body).toMatchObject({
      id: fundingId,
      state: "awaiting_payment",
      provider_display_name: "Development",
      funding_reference: "dev-reference",
      amount_minor: "1250",
      collection_amount_minor: "1250",
      collection_currency: "USD",
      conversion: {
        from_currency: "USD",
        to_currency: "NGN",
        rate: "1326.475",
        observed_at: "2026-09-13T08:00:00.000Z",
      },
      authorization_url: "https://pay.example.test/continue",
      provider_account_snapshot: {
        id: "account-1",
        collectionCurrency: "NGN",
        instruction: "Use the account instruction.",
        fields: [
          { key: "bank_name", label: "Bank", value: "Example Bank", copyable: false },
          { key: "routing", label: "Routing", value: "ROUTE-1", copyable: true },
        ],
      },
      payment_address: "TReceiver",
      payment_amount: "12.50",
      payment_currency: "USDT",
      network: "TRC20",
      instructions: "Send exactly 12.50 USDT.",
      expires_at: "2026-09-11T14:00:00.000Z",
    });
    expect(JSON.stringify(body)).not.toContain("private-rate-source");
  });

  it("projects the persisted bank snapshot before provider initialization", async () => {
    configure(account.id, "initialization_pending", "bank_transfer");
    const response = await GET(new Request(`http://localhost/api/wallet/fund/${fundingId}`), {
      params: Promise.resolve({ id: fundingId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      state: "initialization_pending",
      provider: "bank_transfer",
      provider_account_snapshot: {
        id: "account-1",
        collectionCurrency: "NGN",
        fields: [
          { key: "bank_name", label: "Bank", value: "Example Bank", copyable: false },
          { key: "routing", label: "Routing", value: "ROUTE-1", copyable: true },
        ],
      },
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
    expect(await response.json()).toMatchObject({
      authorization_url: null,
      provider_account_snapshot: null,
    });
  });

  it("hides provider payment details after expiry", async () => {
    configure(account.id, "expired", "nowpayments");
    const response = await GET(new Request(`http://localhost/api/wallet/fund/${fundingId}`), {
      params: Promise.resolve({ id: fundingId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      state: "expired",
      authorization_url: null,
      provider_account_snapshot: null,
      payment_address: null,
      payment_amount: null,
      payment_currency: null,
      expires_at: null,
    });
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
