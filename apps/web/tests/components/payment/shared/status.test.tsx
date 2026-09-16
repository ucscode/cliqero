import { describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-client", () => ({
  apiFetch,
  canonicalWalletFundingUrl: vi.fn(),
  formatExchangeRate: vi.fn(),
}));

import { initializeFundingStatus } from "@/components/payment/shared/status";

describe("payment status initialization", () => {
  it("uses the complete initialize response without a follow-up GET", async () => {
    const status = { id: "funding-1", state: "awaiting_payment" };
    apiFetch.mockResolvedValueOnce(status);

    await expect(initializeFundingStatus("funding-1")).resolves.toBe(status);
    expect(apiFetch).toHaveBeenCalledOnce();
    expect(apiFetch).toHaveBeenCalledWith("/api/wallet/fund/funding-1/initialize", {
      method: "POST",
    });
  });
});
