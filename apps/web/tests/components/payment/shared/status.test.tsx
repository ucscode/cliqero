import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-client", () => ({
  apiFetch,
  canonicalWalletFundingUrl: vi.fn(),
  formatExchangeRate: vi.fn(),
}));

import { initializeFundingStatus } from "@/components/payment/shared/status";

describe("payment status initialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the complete initialize response without a follow-up GET", async () => {
    const status = { id: "funding-1", state: "awaiting_payment" };
    apiFetch.mockResolvedValueOnce(status);

    await expect(initializeFundingStatus("funding-1")).resolves.toBe(status);
    expect(apiFetch).toHaveBeenCalledOnce();
    expect(apiFetch).toHaveBeenCalledWith("/api/wallet/fund/funding-1/initialize", {
      method: "POST",
    });
  });

  it("recovers persisted funding once after initialization fails", async () => {
    const recovered = { id: "funding-1", state: "awaiting_payment" };
    const onRecovered = vi.fn();
    apiFetch
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce(recovered);

    await expect(initializeFundingStatus("funding-1", onRecovered)).rejects.toThrow(
      "provider unavailable",
    );
    expect(onRecovered).toHaveBeenCalledWith(recovered);
    expect(apiFetch).toHaveBeenNthCalledWith(1, "/api/wallet/fund/funding-1/initialize", {
      method: "POST",
    });
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/wallet/fund/funding-1");
  });

  it("preserves the initialization error when recovery GET also fails", async () => {
    const initializationError = new Error("provider unavailable");
    apiFetch.mockRejectedValueOnce(initializationError).mockRejectedValueOnce(new Error("offline"));

    await expect(initializeFundingStatus("funding-1")).rejects.toBe(initializationError);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
