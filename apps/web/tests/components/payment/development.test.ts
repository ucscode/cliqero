import { describe, expect, it, vi } from "vitest";
import { applyDevelopmentVerificationResult } from "@/components/payment/development/payment";
import type { FundingStatus } from "@/lib/api-client";

const funding = { id: "funding-1", state: "awaiting_payment" } as FundingStatus;

describe("development payment verification", () => {
  it("updates funding and refreshes the wallet after confirmation", () => {
    const onFundingChange = vi.fn();
    const onConfirmed = vi.fn();

    applyDevelopmentVerificationResult(
      funding,
      { state: "confirmed" },
      onFundingChange,
      onConfirmed,
    );

    expect(onFundingChange).toHaveBeenCalledWith({ ...funding, state: "confirmed" });
    expect(onConfirmed).toHaveBeenCalledOnce();
  });

  it("does not refresh the wallet for a non-confirmed result", () => {
    const onFundingChange = vi.fn();
    const onConfirmed = vi.fn();

    applyDevelopmentVerificationResult(
      funding,
      { state: "verification_pending" },
      onFundingChange,
      onConfirmed,
    );

    expect(onFundingChange).toHaveBeenCalledWith({ ...funding, state: "verification_pending" });
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});
