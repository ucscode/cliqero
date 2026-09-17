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

    expect(() => container.providers.get("bank_transfer")).toThrow(
      "Payment provider configuration is invalid: bank_transfer",
    );
    expect(loaders.bankTransfer).toHaveBeenCalledOnce();
    expect(loaders.paystack).toHaveBeenCalledOnce();
    expect(loaders.nowPayments).toHaveBeenCalledOnce();
    expect(loaders.directTrc20).toHaveBeenCalledOnce();

    await container.authentication.betterAuth.close();
    await container.database.close();
  });
});
