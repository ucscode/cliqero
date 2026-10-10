import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  container: {
    authentication: { requireVerifiedEmail: vi.fn() },
    transactionPin: { requireValidPin: vi.fn() },
    walletTransfers: { transfer: vi.fn() },
    withdrawals: { create: vi.fn() },
  },
}));

vi.mock("@/infrastructure/container", () => ({ getContainer: () => dependencies.container }));
vi.mock("@/api/compat/http", () => ({
  authenticatedAccount: async () => ({ id: "account-1" }),
  authenticatedPrincipal: async () => ({ kind: "user_session", accountId: "account-1" }),
  apiError: async (error: { message?: string; code?: string; status?: number }) =>
    Response.json({ error: error.message, code: error.code }, { status: error.status ?? 500 }),
}));

import { POST as transfer } from "@/api/compat/wallet/transfers/route";
import { POST as withdrawal } from "@/api/compat/withdrawals/route";

describe("financial request security boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.container.authentication.requireVerifiedEmail.mockResolvedValue(undefined);
    dependencies.container.transactionPin.requireValidPin.mockResolvedValue(undefined);
    dependencies.container.walletTransfers.transfer.mockResolvedValue({ id: "transfer-1" });
    dependencies.container.withdrawals.create.mockResolvedValue({ id: "withdrawal-1" });
  });

  it("rejects an unverified transfer request before financial execution", async () => {
    dependencies.container.authentication.requireVerifiedEmail.mockRejectedValue(
      Object.assign(new Error("Verify your email address before moving money."), {
        code: "email_verification_required",
        status: 403,
      }),
    );
    const response = await transfer(
      new Request("http://localhost/api/wallet/transfers", {
        method: "POST",
        headers: { "idempotency-key": "transfer-once" },
        body: JSON.stringify({
          from: "funding",
          to: "earnings",
          amount_minor: "1000",
          transaction_pin: "123456",
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "email_verification_required" });
    expect(dependencies.container.walletTransfers.transfer).not.toHaveBeenCalled();
  });

  it("rejects a transfer with an invalid PIN before financial execution", async () => {
    dependencies.container.transactionPin.requireValidPin.mockRejectedValue(
      Object.assign(new Error("The transaction PIN is incorrect."), {
        code: "invalid_transaction_pin",
        status: 403,
      }),
    );
    const response = await transfer(
      new Request("http://localhost/api/wallet/transfers", {
        method: "POST",
        headers: { "idempotency-key": "transfer-once" },
        body: JSON.stringify({
          from: "funding",
          to: "earnings",
          amount_minor: "1000",
          transaction_pin: "999999",
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "invalid_transaction_pin" });
    expect(dependencies.container.walletTransfers.transfer).not.toHaveBeenCalled();
  });

  it("requires a PIN on withdrawal creation and checks it before reserving funds", async () => {
    const response = await withdrawal(
      new Request("http://localhost/api/withdrawals", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "withdrawal-once",
        },
        body: JSON.stringify({
          amount_minor: "1000",
          currency: "USD",
          destination_id: "00000000-0000-4000-8000-000000000001",
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(dependencies.container.withdrawals.create).not.toHaveBeenCalled();
  });
});
