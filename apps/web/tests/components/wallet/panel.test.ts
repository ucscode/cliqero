import { describe, expect, it } from "vitest";
import {
  activeFundingAction,
  bankStatusFieldRows,
  fundingActionLabel,
  fundingStatusMessage,
  formatTimeRemaining,
  createFundingStatusPoller,
  FUNDING_STATUS_POLL_INITIAL_DELAY_MS,
  FUNDING_STATUS_POLL_INTERVAL_MS,
  snapshotInstruction,
  verificationObservationClass,
  verificationObservationHeading,
  validatedPreparationAmount,
  walletActivityLabel,
  walletActivityReference,
  walletActivityState,
  walletPanelComposition,
} from "@/components/wallet/panel";
import { canSubmitBankTransferEvidence } from "@/providers/payment/bank-transfer/ui-policy";
import {
  shouldPollDirectTrc20Funding,
  shouldShowSubmittedTransactionHash,
  shouldShowTransactionHashInput,
} from "@/providers/payment/direct-trc20/ui-policy";
import { shouldPollNowPaymentsFunding } from "@/providers/payment/nowpayments/ui-policy";
import {
  formatExchangeRate,
  formatMinorAmount,
  formatMinorCurrency,
  type FundingStatus,
} from "@/lib/api-client";
import { copyValueActionLabel } from "@/components/copy-value";
import {
  initialPaymentCurrency,
  providerPreparationControls,
} from "@/components/payment/shared/preparation";

describe("bank-transfer evidence visibility", () => {
  it.each([
    ["bank_transfer", "initialization_pending", true],
    ["bank_transfer", "initializing", true],
    ["bank_transfer", "awaiting_payment", true],
    ["bank_transfer", "verification_pending", true],
    ["bank_transfer", "confirmed", false],
    ["bank_transfer", "failed", false],
    ["bank_transfer", "expired", false],
    ["paystack", "awaiting_payment", false],
    ["nowpayments", "verification_pending", false],
    ["usdt_trc20", "awaiting_payment", false],
  ])("returns %s for %s in %s", (provider, state, expected) => {
    expect(
      canSubmitBankTransferEvidence({
        provider,
        state,
      } as Pick<FundingStatus, "provider" | "state">),
    ).toBe(expected);
  });
});

describe("wallet page composition", () => {
  it("keeps the overview composition on the wallet overview", () => {
    expect(walletPanelComposition(false)).toEqual({
      showOverview: true,
      showActivity: true,
      showCompactBalance: false,
      showFundingForm: false,
    });
  });

  it("keeps dedicated funding focused on the funding form", () => {
    expect(walletPanelComposition(true)).toEqual({
      showOverview: false,
      showActivity: false,
      showCompactBalance: true,
      showFundingForm: true,
    });
    expect(walletPanelComposition(true, true).showFundingForm).toBe(false);
  });
});

describe("bank transfer snapshot presentation", () => {
  it("reads the specific instruction separately from opaque fields", () => {
    expect(
      snapshotInstruction({
        instruction: "Include the funding reference in the transfer narration.",
        fields: [
          {
            key: "custom_instruction",
            label: "Transfer instruction",
            value: "This remains an opaque configured field.",
          },
        ],
      }),
    ).toBe("Include the funding reference in the transfer narration.");
    expect(
      snapshotInstruction({ fields: [{ key: "instruction", value: "Do not infer this" }] }),
    ).toBe(null);
  });
});

describe("active funding actions", () => {
  it("uses one provider-agnostic action for every active funding", () => {
    expect(
      activeFundingAction({ state: "awaiting_payment", authorization_url: "https://provider" }),
    ).toEqual({ label: "View payment", kind: "status" });
  });

  it.each(["initialization_pending", "initializing", "verification_pending"] as const)(
    "keeps the same action for %s",
    (state) => {
      expect(activeFundingAction({ state, authorization_url: "https://provider" })).toEqual({
        label: "View payment",
        kind: "status",
      });
    },
  );
});

describe("provider preparation context", () => {
  it("accepts only a valid positive canonical USD amount", () => {
    expect(validatedPreparationAmount("25.00")).toBe("2500");
    expect(validatedPreparationAmount("0")).toBeNull();
    expect(validatedPreparationAmount(undefined)).toBeNull();
  });

  it("keeps collection currency out of generic preparation controls", () => {
    expect(providerPreparationControls({ id: "paystack", payment_currencies: [] })).toEqual({
      receivingAccount: false,
      paymentCurrency: false,
    });
    expect(providerPreparationControls({ id: "bank_transfer", payment_currencies: [] })).toEqual({
      receivingAccount: true,
      paymentCurrency: false,
    });
    expect(
      providerPreparationControls({ id: "nowpayments", payment_currencies: [{ code: "btc" }] }),
    ).toEqual({
      receivingAccount: false,
      paymentCurrency: true,
    });
  });

  it("auto-selects only a single payment currency", () => {
    expect(initialPaymentCurrency({ payment_currencies: [{ code: "usdttrc20" }] })).toBe(
      "usdttrc20",
    );
    expect(initialPaymentCurrency({ payment_currencies: [{ code: "btc" }, { code: "eth" }] })).toBe(
      "",
    );
  });
});

describe("customer-facing funding presentation", () => {
  it("keeps the transfer copy value separate from its formatted display", () => {
    const collectionAmountMinor = "3316200";
    const collectionCurrency = "NGN";

    expect(formatMinorCurrency(collectionAmountMinor, collectionCurrency)).toBe("NGN 33,162.00");
    expect(formatMinorAmount(collectionAmountMinor)).toBe("33162.00");
    expect(formatMinorAmount("1000")).toBe("10.00");
  });

  it("formats a persisted Paystack conversion for customer display", () => {
    expect(formatMinorCurrency("3316200", "NGN")).toBe("NGN 33,162.00");
    expect(formatMinorCurrency("2500", "USD")).toBe("$25.00");
    expect(formatExchangeRate("1326.475", "NGN")).toBe("NGN 1,326.48");
  });

  it("uses provider display names and customer success states in activity", () => {
    expect(walletActivityLabel({ type: "funding_credit", provider_display_name: "Paystack" })).toBe(
      "Paystack",
    );
    expect(
      walletActivityReference({
        type: "funding_credit",
        provider_reference: "pay-123",
      }),
    ).toBe("pay-123");
    expect(
      walletActivityReference({ type: "purchase_debit", provider_reference: "pay-ignored" }),
    ).toBe(null);
    expect(
      walletActivityLabel({ type: "funding_credit", provider_display_name: "NOWPayments" }),
    ).not.toContain(" funding");
    expect(walletActivityState("available")).toBe("Funded");
    expect(walletActivityState("pending")).toBe("Pending");
    expect(walletActivityState("complete")).toBe("Completed");
  });

  it("formats the provider expiry countdown and stops at expiry", () => {
    expect(
      formatTimeRemaining("2026-01-01T00:01:05.000Z", Date.parse("2026-01-01T00:00:00Z")),
    ).toBe("Expires in 1:05");
    expect(
      formatTimeRemaining("2026-01-01T00:00:00.000Z", Date.parse("2026-01-01T00:00:01Z")),
    ).toBe("Expired");
  });

  it("uses provider action metadata and state-specific status copy", () => {
    expect(fundingActionLabel({ customer_action: "Pay now" })).toBe("Pay now");
    expect(
      fundingStatusMessage({
        provider: "paystack",
        state: "awaiting_payment",
        expires_at: null,
        error_message: null,
      }),
    ).toBe("Complete the payment to continue.");
    expect(
      fundingStatusMessage({
        provider: "paystack",
        state: "initializing",
        expires_at: null,
        error_message: null,
      }),
    ).toBe("Contacting payment provider.");
    expect(
      fundingStatusMessage({
        provider: "usdt_trc20",
        state: "verification_pending",
        expires_at: null,
        error_message: null,
        verification: {
          status: "confirming",
          level: "info",
          message: "Transaction found. Waiting for 3 more confirmations.",
          checked_at: "2026-09-14T10:00:00.000Z",
          confirmations: 3,
          confirmations_required: 6,
        },
      }),
    ).toBe(null);
    expect(
      fundingStatusMessage({
        provider: "nowpayments",
        state: "expired",
        expires_at: null,
        error_message: null,
      }),
    ).toBe("This payment session has expired. Start a new funding attempt.");
  });

  it("renders every configured bank field, including opaque instructions", () => {
    expect(
      bankStatusFieldRows([
        { key: "bank", label: "Bank name", value: "Example Bank" },
        { key: "account", label: "Account number", value: "0000000000", copyable: true },
        {
          key: "custom",
          label: "Custom instruction",
          value: "Include the funding reference in the transfer narration.",
        },
      ]),
    ).toEqual([
      { key: "bank", label: "Bank name", value: "Example Bank" },
      { key: "account", label: "Account number", value: "0000000000", copyable: true },
      {
        key: "custom",
        label: "Custom instruction",
        value: "Include the funding reference in the transfer narration.",
      },
    ]);
  });

  it("keeps provider polling policy in provider modules", () => {
    expect(shouldPollNowPaymentsFunding({ state: "awaiting_payment" })).toBe(true);
    expect(shouldPollNowPaymentsFunding({ state: "verification_pending" })).toBe(true);
    for (const state of ["confirmed", "failed", "cancelled", "expired"] as const) {
      expect(shouldPollNowPaymentsFunding({ state })).toBe(false);
    }
    expect(shouldPollDirectTrc20Funding({ state: "awaiting_payment" })).toBe(false);
    expect(shouldPollDirectTrc20Funding({ state: "verification_pending" })).toBe(true);
  });

  it("polls status with GET semantics and applies a pending-to-confirmed response", async () => {
    const callbacks: Array<() => void> = [];
    const scheduledDelays: number[] = [];
    const timers = {
      setTimeout: (handler: () => void, delay: number) => {
        scheduledDelays.push(delay);
        callbacks.push(handler);
        return callbacks.length - 1;
      },
      clearTimeout: () => undefined,
    };
    const requests: string[] = [];
    const observed: FundingStatus[] = [];
    let responseCount = 0;
    const pending = {
      id: "funding-1",
      provider: "usdt_trc20" as const,
      state: "verification_pending" as const,
      provider_transaction_id: "A1B2",
    };
    const confirmed = {
      ...pending,
      state: "confirmed" as const,
    };
    const stop = createFundingStatusPoller({
      initialFunding: pending,
      getStatus: async () => {
        requests.push("GET /api/wallet/fund/funding-1");
        responseCount += 1;
        return (responseCount === 1 ? pending : confirmed) as FundingStatus;
      },
      onStatus: (latest) => observed.push(latest),
      timers,
      isVisible: () => true,
      shouldContinue: shouldPollDirectTrc20Funding,
    });

    expect(scheduledDelays).toEqual([FUNDING_STATUS_POLL_INITIAL_DELAY_MS]);
    callbacks.shift()?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(requests).toEqual(["GET /api/wallet/fund/funding-1"]);
    expect(observed).toHaveLength(1);
    expect(observed[0]?.state).toBe("verification_pending");
    expect(scheduledDelays).toEqual([
      FUNDING_STATUS_POLL_INITIAL_DELAY_MS,
      FUNDING_STATUS_POLL_INTERVAL_MS,
    ]);

    callbacks.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(requests).toEqual(["GET /api/wallet/fund/funding-1", "GET /api/wallet/fund/funding-1"]);
    expect(observed.at(-1)?.state).toBe("confirmed");
    expect(scheduledDelays).toHaveLength(2);
    stop();
  });

  it("does not create duplicate timers while a status request is in flight", async () => {
    const callbacks: Array<() => void> = [];
    let resolveStatus: ((funding: FundingStatus) => void) | undefined;
    let scheduledCount = 0;
    const timers = {
      setTimeout: (handler: () => void) => {
        scheduledCount += 1;
        callbacks.push(handler);
        return callbacks.length - 1;
      },
      clearTimeout: () => undefined,
    };
    const stop = createFundingStatusPoller({
      initialFunding: {
        state: "verification_pending",
      },
      getStatus: () =>
        new Promise((resolve) => {
          resolveStatus = resolve;
        }),
      onStatus: () => undefined,
      timers,
      isVisible: () => true,
      shouldContinue: shouldPollDirectTrc20Funding,
    });

    callbacks.shift()?.();
    callbacks[0]?.();
    expect(scheduledCount).toBe(1);
    resolveStatus?.({
      id: "funding-1",
      provider: "usdt_trc20",
      state: "confirmed",
      provider_transaction_id: "A1B2",
    } as FundingStatus);
    await Promise.resolve();
    await Promise.resolve();
    stop();
  });

  it("keeps rejected transaction inputs editable and accepted ones read-only", () => {
    expect(
      shouldShowTransactionHashInput({
        provider: "usdt_trc20",
        state: "awaiting_payment",
        provider_transaction_id: null,
      }),
    ).toBe(true);
    expect(
      shouldShowTransactionHashInput({
        provider: "usdt_trc20",
        state: "verification_pending",
        provider_transaction_id: null,
      }),
    ).toBe(true);
    expect(
      shouldShowSubmittedTransactionHash({
        provider: "usdt_trc20",
        provider_transaction_id: "AbCd".repeat(16),
      }),
    ).toBe(true);
    expect(
      shouldShowTransactionHashInput({
        provider: "usdt_trc20",
        state: "verification_pending",
        provider_transaction_id: "AbCd".repeat(16),
      }),
    ).toBe(false);
  });

  it("provides a prominent heading for verification errors", () => {
    expect(
      verificationObservationHeading({
        status: "not_found",
        level: "error",
        message: "Transaction not found.",
        checked_at: null,
      }),
    ).toBe("Transaction not found");
    expect(
      verificationObservationHeading({
        status: "provider_error",
        level: "error",
        message: "Try again.",
        checked_at: null,
      }),
    ).toBe("Verification temporarily unavailable");
    expect(
      verificationObservationClass({
        status: "confirming",
        level: "info",
        message: "Waiting for confirmations.",
        checked_at: null,
      }),
    ).toContain("bg-blue-50");
    expect(
      verificationObservationClass({
        status: "success",
        level: "success",
        message: "Payment verified.",
        checked_at: null,
      }),
    ).toContain("bg-emerald-50");
  });

  it("preserves arbitrary bank field order and copy metadata for rendering", () => {
    expect(
      bankStatusFieldRows([
        { key: "first", label: "First field", value: "one", copyable: false },
        { key: "second", label: "Second field", value: "two", copyable: true },
        { key: "third", label: "Third field", value: "three" },
      ]),
    ).toEqual([
      { key: "first", label: "First field", value: "one", copyable: false },
      { key: "second", label: "Second field", value: "two", copyable: true },
      { key: "third", label: "Third field", value: "three" },
    ]);
  });

  it("uses compact copy labels for reference IDs", () => {
    expect(copyValueActionLabel("reference ID", false)).toBe("Copy reference ID");
    expect(copyValueActionLabel("reference ID", true)).toBe("reference ID copied");
  });
});
