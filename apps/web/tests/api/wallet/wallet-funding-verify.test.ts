import { describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => fixtures.container,
}));

import { POST } from "@/api/compat/wallet/fund/[id]/verify/route";

const fundingId = "00000000-0000-4000-8000-000000000010";
const account = { id: "00000000-0000-4000-8000-000000000001" };

function configure(state = "verification_pending") {
  const funding = {
    id: fundingId,
    accountId: account.id,
    providerName: "usdt_trc20",
    providerReference: "usdt-reference",
    providerTransactionId: "AbCd".repeat(16),
    state,
    providerInitialization: {
      verification: {
        status: "not_found",
        message: "Transaction not found on TRON yet.",
        checkedAt: "2026-09-14T10:00:00.000Z",
      },
    },
  };
  fixtures.container = {
    principalResolver: { resolve: vi.fn(async () => ({ account })) },
    funding: { findById: vi.fn(async () => funding) },
    fundingVerification: {
      process: vi.fn(async () => ({ ...funding, state: "verification_pending" })),
    },
  };
  return funding;
}

describe("wallet funding foreground verification API", () => {
  it("invokes the shared verifier and returns the persisted observation", async () => {
    configure();
    const response = await POST(
      new Request(`http://localhost/api/wallet/fund/${fundingId}/verify`),
      {
        params: Promise.resolve({ id: fundingId }),
      },
    );

    expect(response.status).toBe(200);
    expect(fixtures.container.fundingVerification.process).toHaveBeenCalledWith(fundingId, {
      rethrowProviderErrors: false,
    });
    expect(await response.json()).toMatchObject({
      state: "verification_pending",
      provider_transaction_id: "AbCd".repeat(16),
      verification: {
        status: "not_found",
        message: "Transaction not found on TRON yet.",
      },
    });
  });

  it("does not invoke provider verification for a terminal funding", async () => {
    configure("failed");
    const response = await POST(
      new Request(`http://localhost/api/wallet/fund/${fundingId}/verify`),
      {
        params: Promise.resolve({ id: fundingId }),
      },
    );

    expect(response.status).toBe(200);
    expect(fixtures.container.fundingVerification.process).not.toHaveBeenCalled();
  });
});
