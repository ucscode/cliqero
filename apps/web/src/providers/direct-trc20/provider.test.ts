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
    expect(result.metadata).toMatchObject({
      paymentAddress: "TReceiver",
      paymentCurrency: "USDT",
      network: "TRC20",
      asset: "USDT",
    });
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it("remains pending until enough confirmations exist", async () => {
    const verifier = {
      verify: vi.fn().mockResolvedValue({
        transactionHash: "hash",
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
      initialization: { transactionHash: "hash" },
    });
    expect(result).toMatchObject({ verified: false, status: "confirming" });
  });
});
