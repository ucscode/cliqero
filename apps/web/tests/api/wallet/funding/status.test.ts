import { describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => fixtures.container,
}));

import { GET, customerFailureMessage } from "@/api/compat/wallet/fund/[id]/route";
import { projectVerificationObservation } from "@/modules/funding/funding";

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
        providerTransactionId: providerName === "usdt_trc20" ? "a".repeat(64) : null,
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
          verification: {
            status: "confirming",
            message: "Transaction found. Waiting for 3 more confirmations.",
            resolved: false,
            checkedAt: "2026-09-13T08:01:00.000Z",
            confirmations: 3,
            confirmationsRequired: 6,
          },
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
  it("conservatively projects legacy observations without resolution metadata", () => {
    expect(projectVerificationObservation({ status: "success", message: "Done." })).toMatchObject({
      resolved: true,
    });
    expect(
      projectVerificationObservation({ status: "not_found", message: "Not found." }),
    ).toMatchObject({ resolved: false });
    expect(
      projectVerificationObservation({
        status: "confirming",
        message: "Waiting.",
        resolved: true,
      }),
    ).toMatchObject({ resolved: true });
  });

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
      provider_transaction_id: null,
      amount_minor: "1250",
      collection_amount_minor: "1250",
      collection_currency: "USD",
      conversion: {
        from_currency: "USD",
        to_currency: "NGN",
        rate: "1326.475",
        observed_at: "2026-09-13T08:00:00.000Z",
      },
      verification: {
        status: "confirming",
        level: "info",
        message: "Transaction found. Waiting for 3 more confirmations.",
        resolved: false,
        checked_at: "2026-09-13T08:01:00.000Z",
        confirmations: 3,
        confirmations_required: 6,
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

  it("projects all persisted bank-transfer evidence fields", async () => {
    configure(account.id, "verification_pending", "bank_transfer");
    fixtures.container.bankTransferEvidence = {
      findForFunding: vi.fn(async () => ({
        id: "00000000-0000-4000-8000-000000000011",
        fundingId,
        transferReference: "bank-ref-123",
        customerNote: "optional context",
        proofImageUrl: null,
        proof: {
          provider: "private_media",
          container: "evidence",
          key: "private/receipt.png",
          originalFilename: "receipt.png",
          mimeType: "image/png",
          byteSize: "8",
        },
        createdAt: "2026-09-13T06:00:00.000Z",
        state: "verification_pending" as const,
      })),
    };

    const response = await GET(new Request(`http://localhost/api/wallet/fund/${fundingId}`), {
      params: Promise.resolve({ id: fundingId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      evidence: {
        transfer_reference: "bank-ref-123",
        customer_note: "optional context",
        proof: {
          original_filename: "receipt.png",
          mime_type: "image/png",
          byte_size: "8",
        },
        created_at: "2026-09-13T06:00:00.000Z",
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
