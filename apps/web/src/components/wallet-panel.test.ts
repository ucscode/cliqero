import { describe, expect, it } from "vitest";
import {
  activeFundingAction,
  bankStatusFieldRows,
  canSubmitBankTransferEvidence,
  fundingActionLabel,
  fundingStatusMessage,
  formatTimeRemaining,
  validatedPreparationAmount,
  walletActivityLabel,
  walletActivityState,
  walletPanelComposition,
} from "./wallet-panel";
import type { FundingStatus } from "@/lib/api-client";
import { copyValueActionLabel } from "./copy-value";
import {
  initialPaymentCurrency,
  providerPreparationControls,
} from "./funding-provider-preparation";

describe("bank-transfer evidence visibility", () => {
  it.each([
    ["bank_transfer", "awaiting_payment", true],
    ["bank_transfer", "verification_pending", true],
    ["bank_transfer", "confirmed", false],
    ["bank_transfer", "failed", false],
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
  it("uses provider display names and customer success states in activity", () => {
    expect(walletActivityLabel({ type: "funding_credit", provider_display_name: "Paystack" })).toBe(
      "Paystack funding",
    );
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
  });

  it("keeps bank fields as separate rows and hides duplicate reference instructions", () => {
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
    ]);
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
