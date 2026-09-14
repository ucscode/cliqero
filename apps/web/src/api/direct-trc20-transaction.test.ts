import { describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => fixtures.container,
}));

import { POST } from "@/api/compat/wallet/fund/[id]/transaction/route";

const fundingId = "00000000-0000-4000-8000-000000000010";
const account = { id: "00000000-0000-4000-8000-000000000001" };
const transactionHash = "a".repeat(64);

function configure(submitTransaction: ReturnType<typeof vi.fn>) {
  fixtures.container = {
    principalResolver: { resolve: vi.fn(async () => ({ account })) },
    fundingService: { submitTransaction },
  };
}

function request(body: unknown) {
  return new Request(`http://localhost/api/wallet/fund/${fundingId}/transaction`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Direct USDT TRC20 transaction submission API", () => {
  it("submits a valid hash through FundingService and returns verification_pending", async () => {
    const submitTransaction = vi.fn(async (input: unknown) => ({
      id: fundingId,
      state: "verification_pending" as const,
      input,
    }));
    configure(submitTransaction);

    const response = await POST(request({ transaction_hash: transactionHash }), {
      params: Promise.resolve({ id: fundingId }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ id: fundingId, state: "verification_pending" });
    expect(submitTransaction).toHaveBeenCalledWith({
      accountId: account.id,
      fundingId,
      transactionHash,
    });
  });

  it("returns not-found for an unknown funding", async () => {
    const submitTransaction = vi.fn(async () => {
      throw new Error("Funding not found");
    });
    configure(submitTransaction);

    const response = await POST(request({ transaction_hash: transactionHash }), {
      params: Promise.resolve({ id: fundingId }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "Funding not found" });
  });

  it("rejects an invalid hash before calling the funding service", async () => {
    const submitTransaction = vi.fn();
    configure(submitTransaction);

    const response = await POST(request({ transaction_hash: "not-a-tron-hash" }), {
      params: Promise.resolve({ id: fundingId }),
    });

    expect(response.status).toBe(400);
    expect(submitTransaction).toHaveBeenCalledWith({
      accountId: account.id,
      fundingId,
      transactionHash: "not-a-tron-hash",
    });
  });

  it("returns a customer-safe error for non-TRC20 funding", async () => {
    const submitTransaction = vi.fn(async () => {
      throw new Error("Transaction hash is not supported for this funding method");
    });
    configure(submitTransaction);

    const response = await POST(request({ transaction_hash: transactionHash }), {
      params: Promise.resolve({ id: fundingId }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Transaction hash is not supported for this funding method",
    });
  });
});
