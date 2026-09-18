import { afterEach, describe, expect, it, vi } from "vitest";

const loaders = vi.hoisted(() => ({
  bankTransfer: vi.fn(() => {
    throw new Error("bank-transfer test configuration is invalid");
  }),
  nowPayments: vi.fn(() => null),
  directTrc20: vi.fn(() => null),
  paystack: vi.fn(() => null),
  paystackPayout: vi.fn(() => null),
}));

vi.mock("@/providers/payment/bank-transfer/config", () => ({
  loadBankTransferConfiguration: loaders.bankTransfer,
}));
vi.mock("@/providers/payment/nowpayments/config", () => ({
  loadNowPaymentsConfiguration: loaders.nowPayments,
}));
vi.mock("@/providers/payment/direct-trc20/config", () => ({
  loadDirectTrc20Configuration: loaders.directTrc20,
}));
vi.mock("@/providers/payment/paystack/config", () => ({
  loadPaystackConfiguration: loaders.paystack,
}));
vi.mock("@/providers/payout/paystack/config", () => ({
  loadPaystackPayoutConfiguration: loaders.paystackPayout,
}));

import { createContainer } from "@/infrastructure/container";

describe("application container feature isolation", () => {
  afterEach(() => vi.clearAllMocks());

  it("does not load optional provider configuration for authentication", async () => {
    const container = createContainer("postgresql://localhost/cliqero-test");

    expect(loaders.bankTransfer).not.toHaveBeenCalled();
    expect(loaders.nowPayments).not.toHaveBeenCalled();
    expect(loaders.directTrc20).not.toHaveBeenCalled();
    expect(loaders.paystack).not.toHaveBeenCalled();
    expect(loaders.paystackPayout).not.toHaveBeenCalled();

    expect(container.authentication).toBe(container.authentication);
    expect(loaders.bankTransfer).not.toHaveBeenCalled();
    expect(loaders.paystackPayout).not.toHaveBeenCalled();

    await container.authentication.betterAuth.close();
    await container.database.close();

    vi.clearAllMocks();
    const paystackContainer = createContainer("postgresql://localhost/cliqero-test");
    expect(() => paystackContainer.providers.get("paystack")).toThrow(
      "Payment provider is unavailable: paystack",
    );
    expect(loaders.paystack).toHaveBeenCalledOnce();
    expect(loaders.nowPayments).not.toHaveBeenCalled();
    expect(loaders.directTrc20).not.toHaveBeenCalled();
    expect(loaders.bankTransfer).not.toHaveBeenCalled();
    await paystackContainer.authentication.betterAuth.close();
    await paystackContainer.database.close();

    vi.clearAllMocks();
    const bankContainer = createContainer("postgresql://localhost/cliqero-test");
    expect(() => bankContainer.providers.get("bank_transfer")).toThrow(
      "Payment provider configuration is invalid: bank_transfer",
    );
    expect(loaders.bankTransfer).toHaveBeenCalledOnce();
    expect(loaders.paystack).not.toHaveBeenCalled();
    expect(loaders.nowPayments).not.toHaveBeenCalled();
    expect(loaders.directTrc20).not.toHaveBeenCalled();
    await bankContainer.authentication.betterAuth.close();
    await bankContainer.database.close();
  });

  it("keeps the configured Direct TRC20 registry identity aligned with the provider", async () => {
    const container = createContainer("postgresql://localhost/cliqero-test");
    loaders.directTrc20.mockImplementationOnce(
      () =>
        ({
          provider: {
            displayName: "Direct USDT TRC20",
            imageUrl: "/images/payment/usdt-trc20.svg",
            description: "Send USDT on the TRON TRC20 network directly.",
            walletAddress: "TVX22re4mJPQt9wWM48jF7bfRSzmJWcBAV",
            confirmationsRequired: 1,
            maxTransactionAgeSeconds: 3600,
            tokenContract: "TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs",
            verification: {
              provider: "trongrid",
              apiBaseUrl: "https://api.shasta.trongrid.io",
            },
          },
          filters: { countries: null },
        }) as never,
    );

    try {
      const methods = container.providers.availableMethodsFor({ country: "NG" });

      expect(methods.map(({ provider }) => provider.name)).toContain("usdt_trc20");
      expect(container.providers.get("usdt_trc20").name).toBe("usdt_trc20");
    } finally {
      await container.authentication.betterAuth.close();
      await container.database.close();
    }
  });
});
