import { describe, expect, it } from "vitest";
import {
  activeFundingAction,
  canSubmitBankTransferEvidence,
  validatedPreparationAmount,
  walletPanelComposition,
} from "./wallet-panel";
import type { FundingStatus } from "@/lib/api-client";

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
});
