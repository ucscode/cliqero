import { describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => fixtures.container,
}));

import { POST } from "@/api/compat/wallet/fund/[id]/initialize/route";

const fundingId = "00000000-0000-4000-8000-000000000010";
const account = { id: "00000000-0000-4000-8000-000000000001" };

function configure(state: string, providerName = "paystack") {
  const funding = {
    id: fundingId,
    accountId: account.id,
    providerName,
    providerReference: "pay-reference",
    canonicalAmount: { minorAmount: 100n, currency: "USD" },
    collectionAmount: { minorAmount: 132688n, currency: "NGN" },
    providerInitialization:
      state === "awaiting_payment"
        ? { authorizationUrl: "https://pay.example.test/continue", accessCode: "access" }
        : {},
    state,
  };
  const process = vi.fn(async () => {
    funding.state = "awaiting_payment";
    funding.providerInitialization = {
      authorizationUrl: "https://pay.example.test/continue",
      accessCode: "access",
    };
    return funding;
  });
  fixtures.container = {
    principalResolver: { resolve: vi.fn(async () => ({ account })) },
    funding: { findById: vi.fn(async () => funding) },
    fundingInitialization: { process },
  };
  return { funding, process };
}

describe("wallet funding initialization endpoint", () => {
  it("initializes the persisted Paystack funding and returns saved provider facts", async () => {
    const { process } = configure("initialization_pending");
    const response = await POST(new Request("http://localhost/api/wallet/fund/${id}/initialize"), {
      params: Promise.resolve({ id: fundingId }),
    });

    expect(response.status).toBe(200);
    expect(process).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({
      id: fundingId,
      state: "awaiting_payment",
      amount_minor: "100",
      currency: "USD",
      collection_amount_minor: "132688",
      collection_currency: "NGN",
      authorization_url: "https://pay.example.test/continue",
    });
  });

  it("does not initialize an already initialized funding twice", async () => {
    const { process } = configure("awaiting_payment");
    const response = await POST(new Request("http://localhost/api/wallet/fund/${id}/initialize"), {
      params: Promise.resolve({ id: fundingId }),
    });

    expect(response.status).toBe(200);
    expect(process).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      state: "awaiting_payment",
      authorization_url: "https://pay.example.test/continue",
    });
  });

  it("initializes Bank Transfer funding through the initialization endpoint", async () => {
    const { process } = configure("initialization_pending", "bank_transfer");
    const response = await POST(new Request("http://localhost/api/wallet/fund/${id}/initialize"), {
      params: Promise.resolve({ id: fundingId }),
    });

    expect(response.status).toBe(200);
    expect(process).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({ state: "awaiting_payment" });
  });
});
