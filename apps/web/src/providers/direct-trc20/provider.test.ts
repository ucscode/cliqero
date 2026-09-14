import { describe, expect, it, vi } from "vitest";
import { Money } from "@/modules/money/money";
import type { DirectTrc20Transfer } from "./verifier";
import { DirectTrc20Provider } from "./provider";

const now = new Date("2026-09-14T12:00:00.000Z");
const transactionHash = "AbCd".repeat(16);
const config = {
  walletAddress: "TReceiver",
  confirmationsRequired: 6,
  maxTransactionAgeSeconds: 3600,
  tokenContract: "TToken",
  verification: { provider: "trongrid" as const, apiBaseUrl: "https://api.shasta.trongrid.io" },
};
const expectedAmount = Money.of(1250n, "USD");

function validTransfer(overrides: Partial<DirectTrc20Transfer> = {}): DirectTrc20Transfer {
  return {
    transactionHash,
    network: "TRC20" as const,
    destination: "TReceiver",
    asset: "USDT" as const,
    amountBaseUnits: 12500000n,
    timestamp: now.getTime() - 60_000,
    confirmations: 6,
    status: "confirmed" as const,
    ...overrides,
  };
}

function verify(transfer: DirectTrc20Transfer) {
  return new DirectTrc20Provider(config, { verify: vi.fn(async () => transfer) }, () => now).verify(
    {
      reference: "ref",
      expectedAmount,
      providerTransactionId: transactionHash,
    },
  );
}

describe("direct TRC20 provider", () => {
  it("initializes a direct wallet method without NOWPayments", async () => {
    const verifier = { verify: vi.fn() };
    const provider = new DirectTrc20Provider(config, verifier, () => now);
    const result = await provider.initiate({
      paymentId: "00000000-0000-4000-8000-000000000001",
      amount: Money.of(1250n, "USD"),
      idempotencyKey: "key",
      buyerEmail: "buyer@example.test",
    });
    expect(result.reference).toBe("usdt-00000000-0000-4000-8000-000000000001");
    expect(result.metadata).toMatchObject({
      paymentAddress: "TReceiver",
      paymentCurrency: "USDT",
      network: "TRC20",
      asset: "USDT",
      instructions: "Send exactly **12.50 USDT** on **TRC20** to **TReceiver**.",
    });
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it("returns awaiting transaction without an external identity when no hash exists", async () => {
    await expect(
      new DirectTrc20Provider(config, { verify: vi.fn() }, () => now).verify({
        reference: "ref",
        expectedAmount,
      }),
    ).resolves.toMatchObject({ status: "awaiting_transaction" });
  });

  it("accepts a confirming transaction identity before final confirmation", async () => {
    await expect(verify(validTransfer({ confirmations: 5 }))).resolves.toMatchObject({
      verified: false,
      status: "confirming",
      providerTransactionId: transactionHash,
      observation: { level: "info" },
    });
  });

  it("accepts a confirmed transaction identity and payment", async () => {
    await expect(verify(validTransfer())).resolves.toMatchObject({
      verified: true,
      status: "success",
      providerTransactionId: transactionHash,
    });
  });

  it("accepts an otherwise valid insufficient transfer and retains its identity", async () => {
    await expect(verify(validTransfer({ amountBaseUnits: 1_000_000n }))).resolves.toMatchObject({
      verified: false,
      status: "mismatch",
      providerTransactionId: transactionHash,
      observation: { level: "error" },
    });
  });

  it("retains a matching failed transaction as an admitted identity", async () => {
    await expect(
      verify(validTransfer({ status: "failed", confirmations: 0 })),
    ).resolves.toMatchObject({
      verified: false,
      status: "failed",
      providerTransactionId: transactionHash,
    });
  });

  it.each([
    ["not found", { status: "not_found" }, "not_found"],
    ["too old", { timestamp: now.getTime() - 3601_000 }, "mismatch"],
    ["wrong token", { issue: "wrong_token_contract" }, "mismatch"],
    ["wrong destination", { issue: "wrong_destination" }, "mismatch"],
    ["missing transfer details", { destination: "", amountBaseUnits: 0n }, "mismatch"],
    ["missing timestamp", { timestamp: 0 }, "mismatch"],
  ] as const)("rejects %s without accepting its identity", async (_label, transfer, status) => {
    const result = await verify(validTransfer(transfer));
    expect(result).toMatchObject({ verified: false, status });
    expect(result.providerTransactionId).toBeUndefined();
  });

  it("does not admit a pending transaction until transfer details are available", async () => {
    const result = await verify(
      validTransfer({ status: "pending", destination: "", amountBaseUnits: 0n }),
    );
    expect(result).toMatchObject({
      status: "mismatch",
      observation: { message: expect.stringContaining("details are not available") },
    });
    expect(result.providerTransactionId).toBeUndefined();
  });
});
