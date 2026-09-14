import { describe, expect, it, vi } from "vitest";
import { Money } from "@/modules/money/money";
import { DirectTrc20Provider } from "./provider";

const config = {
  walletAddress: "TReceiver",
  confirmationsRequired: 6,
  tokenContract: "TToken",
  verification: { provider: "trongrid" as const, apiBaseUrl: "https://api.shasta.trongrid.io" },
};

describe("direct TRC20 provider", () => {
  it("initializes a direct wallet method without NOWPayments", async () => {
    const verifier = { verify: vi.fn() };
    const provider = new DirectTrc20Provider(config, verifier);
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
      instructions:
        "Send exactly **12.50 USDT** on **TRC20** to **TReceiver**.\n\n**Submit the blockchain transaction hash after sending.**",
    });
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it("remains pending until enough confirmations exist", async () => {
    const transactionHash = "AbCd".repeat(16);
    const verifier = {
      verify: vi.fn().mockResolvedValue({
        transactionHash,
        network: "TRC20",
        destination: "TReceiver",
        asset: "USDT",
        amountBaseUnits: 12500000n,
        confirmations: 5,
        status: "confirmed",
      }),
    };
    const provider = new DirectTrc20Provider(config, verifier);
    const result = await provider.verify({
      reference: "ref",
      expectedAmount: Money.of(1250n, "USD"),
      providerTransactionId: transactionHash,
    });
    expect(result).toMatchObject({ verified: false, status: "confirming" });
    expect(verifier.verify).toHaveBeenCalledWith({
      transactionHash,
      network: "TRC20",
      destination: "TReceiver",
      tokenContract: "TToken",
    });
  });

  it("returns customer-safe not-found feedback", async () => {
    const verifier = {
      verify: vi.fn().mockResolvedValue({
        transactionHash: "a".repeat(64),
        network: "TRC20",
        destination: "TReceiver",
        asset: "USDT",
        amountBaseUnits: 0n,
        confirmations: 0,
        status: "not_found",
      }),
    };
    const result = await new DirectTrc20Provider(config, verifier).verify({
      reference: "ref",
      expectedAmount: Money.of(1250n, "USD"),
      providerTransactionId: "a".repeat(64),
    });
    expect(result).toMatchObject({
      verified: false,
      status: "not_found",
      observation: { status: "not_found" },
    });
  });

  it("reports an insufficient confirmed transfer as a mismatch", async () => {
    const verifier = {
      verify: vi.fn().mockResolvedValue({
        transactionHash: "a".repeat(64),
        network: "TRC20",
        destination: "TReceiver",
        asset: "USDT",
        amountBaseUnits: 1_000_000n,
        confirmations: 6,
        status: "confirmed",
      }),
    };
    const result = await new DirectTrc20Provider(config, verifier).verify({
      reference: "ref",
      expectedAmount: Money.of(1250n, "USD"),
      providerTransactionId: "a".repeat(64),
    });
    expect(result).toMatchObject({
      verified: false,
      status: "mismatch",
      observation: {
        status: "mismatch",
        message:
          "The transaction was found, but the received amount is below the required 12.50 USDT.",
      },
    });
  });
});
