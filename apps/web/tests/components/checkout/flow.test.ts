import { describe, expect, it, vi } from "vitest";
import {
  applyCheckoutPollResult,
  checkoutPrimaryAction,
  checkoutStatusPresentation,
} from "@/components/checkout/flow";

describe("checkout status presentation", () => {
  it.each([
    ["awaiting_funds", "Awaiting funds", "warning", "justify-self-start"],
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

  it("refreshes wallet availability while checkout awaits funds", async () => {
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
    const awaiting = {
      id: "checkout-1",
      purchase_id: "purchase-1",
      state: "awaiting_funds" as const,
      amount_minor: "1000",
      currency: "USD",
    };

    const first = await applyCheckoutPollResult(
      awaiting,
      { wallet: null, balanceError: null, paidWalletRefreshCheckoutId: null },
      loadWallet,
    );
    const second = await applyCheckoutPollResult(
      awaiting,
      {
        wallet: first.wallet,
        balanceError: first.balanceError,
        paidWalletRefreshCheckoutId: first.paidWalletRefreshCheckoutId,
      },
      loadWallet,
    );

    expect(loadWallet).toHaveBeenCalledTimes(2);
    expect(first).toMatchObject({
      checkout: { state: "awaiting_funds" },
      wallet: firstWallet,
      shouldContinuePolling: true,
    });
    expect(second).toMatchObject({
      checkout: { state: "awaiting_funds" },
      wallet: secondWallet,
      shouldContinuePolling: true,
    });
  });

  it("preserves awaiting-funds state and polling when wallet refresh fails", async () => {
    const wallet = {
      currency: "USD" as const,
      available_minor: "500",
      pending_minor: "0",
      active_fundings: [],
    };
    const loadWallet = vi.fn(async () => {
      throw new Error("wallet unavailable");
    });
    const awaiting = {
      id: "checkout-1",
      purchase_id: "purchase-1",
      state: "awaiting_funds" as const,
      amount_minor: "1000",
      currency: "USD",
    };

    const result = await applyCheckoutPollResult(
      awaiting,
      { wallet, balanceError: null, paidWalletRefreshCheckoutId: null },
      loadWallet,
    );

    expect(result).toMatchObject({
      checkout: { state: "awaiting_funds" },
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
