import { describe, expect, it, vi } from "vitest";
import {
  applyCheckoutPollResult,
  checkoutPrimaryAction,
  checkoutStatusPresentation,
  walletShortfallMinor,
} from "@/components/checkout/flow";

describe("wallet shortfall calculation", () => {
  it.each([
    ["1400", "2500", "0"],
    ["1400", "1100", "300"],
    ["900", "1000", "0"],
    ["10000", "9000", "1000"],
    ["1000", "1000", "0"],
  ])("calculates %s required against %s available as %s", (required, available, expected) => {
    expect(walletShortfallMinor(required, available)).toBe(expected);
  });
});

describe("checkout status presentation", () => {
  it.each([
    ["pending", "Ready to pay", "warning", "justify-self-start"],
    ["paid", "Paid", "default", "justify-self-start"],
    ["failed", "Payment failed", "destructive", "justify-self-start"],
  ] as const)(
    "maps %s to customer-safe status presentation",
    (state, label, variant, className) => {
      expect(checkoutStatusPresentation(state)).toEqual({
        label,
        variant,
        className,
      });
    },
  );

  it.each([
    ["sufficient wallet", false, false, true, "0", "Pay now"],
    ["shortfall", false, false, true, "1", "Fund wallet"],
    ["busy", true, false, true, "1", "Paying…"],
    ["restoring", false, true, false, null, "Loading checkout…"],
  ] as const)(
    "uses the real CTA policy for %s",
    (_name, busy, restoring, walletLoaded, shortfall, label) => {
      expect(
        checkoutPrimaryAction({ busy, restoring, walletLoaded, shortfallMinor: shortfall }),
      ).toBe(label);
    },
  );

  it("refreshes wallet availability while checkout is pending", async () => {
    const firstWallet = {
      currency: "USD" as const,
      available_minor: "500",
      pending_minor: "0",
      active_fundings: [],
    };
    const secondWallet = { ...firstWallet, available_minor: "750" };
    const loadWallet = vi
      .fn<() => Promise<typeof firstWallet>>()
      .mockResolvedValueOnce(firstWallet)
      .mockResolvedValueOnce(secondWallet);
    const pending = {
      id: "checkout-1",
      purchase_id: "purchase-1",
      state: "pending" as const,
      amount_minor: "1000",
      currency: "USD",
    };

    const first = await applyCheckoutPollResult(
      pending,
      { wallet: null, balanceError: null, paidWalletRefreshCheckoutId: null },
      loadWallet,
    );
    const second = await applyCheckoutPollResult(
      pending,
      {
        wallet: first.wallet,
        balanceError: first.balanceError,
        paidWalletRefreshCheckoutId: first.paidWalletRefreshCheckoutId,
      },
      loadWallet,
    );

    expect(loadWallet).toHaveBeenCalledTimes(2);
    expect(first).toMatchObject({
      checkout: { state: "pending" },
      wallet: firstWallet,
      shouldContinuePolling: true,
    });
    expect(second).toMatchObject({
      checkout: { state: "pending" },
      wallet: secondWallet,
      shouldContinuePolling: true,
    });
  });

  it("preserves pending state and polling when wallet refresh fails", async () => {
    const wallet = {
      currency: "USD" as const,
      available_minor: "500",
      pending_minor: "0",
      active_fundings: [],
    };
    const loadWallet = vi.fn(async () => {
      throw new Error("wallet unavailable");
    });
    const pending = {
      id: "checkout-1",
      purchase_id: "purchase-1",
      state: "pending" as const,
      amount_minor: "1000",
      currency: "USD",
    };

    const result = await applyCheckoutPollResult(
      pending,
      { wallet, balanceError: null, paidWalletRefreshCheckoutId: null },
      loadWallet,
    );

    expect(result).toMatchObject({
      checkout: { state: "pending" },
      wallet,
      balanceError: null,
      shouldContinuePolling: true,
    });
  });

  it("refreshes the wallet once when checkout becomes paid and preserves paid state on failure", async () => {
    const wallet = {
      currency: "USD" as const,
      available_minor: "2500",
      pending_minor: "0",
      active_fundings: [],
    };
    const loadWallet = vi.fn(async () => wallet);
    const paid = {
      id: "checkout-1",
      purchase_id: "purchase-1",
      state: "paid" as const,
      amount_minor: "1000",
      currency: "USD",
    };
    const first = await applyCheckoutPollResult(
      paid,
      { wallet: null, balanceError: null, paidWalletRefreshCheckoutId: null },
      loadWallet,
    );
    const second = await applyCheckoutPollResult(
      paid,
      {
        wallet: first.wallet,
        balanceError: first.balanceError,
        paidWalletRefreshCheckoutId: first.paidWalletRefreshCheckoutId,
      },
      loadWallet,
    );

    expect(loadWallet).toHaveBeenCalledOnce();
    expect(first).toMatchObject({
      checkout: { state: "paid" },
      wallet,
      balanceError: null,
      shouldContinuePolling: false,
    });
    expect(second).toMatchObject({
      checkout: { state: "paid" },
      wallet,
      shouldContinuePolling: false,
    });

    const failedLoader = vi.fn(async () => {
      throw new Error("wallet unavailable");
    });
    const failed = await applyCheckoutPollResult(
      paid,
      { wallet: null, balanceError: null, paidWalletRefreshCheckoutId: null },
      failedLoader,
    );
    const failedRetry = await applyCheckoutPollResult(
      paid,
      {
        wallet: failed.wallet,
        balanceError: failed.balanceError,
        paidWalletRefreshCheckoutId: failed.paidWalletRefreshCheckoutId,
      },
      failedLoader,
    );
    expect(failedLoader).toHaveBeenCalledOnce();
    expect(failed).toMatchObject({
      checkout: { state: "paid" },
      balanceError: "Payment is complete, but your wallet balance could not be refreshed.",
      shouldContinuePolling: false,
    });
    expect(failedRetry.checkout.state).toBe("paid");
  });
});
