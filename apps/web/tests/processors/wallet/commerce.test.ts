import { describe, expect, it, vi } from "vitest";
import { WalletCreditProcessor } from "@/processors/wallet/commerce";
import { Money } from "@/modules/money/money";

describe("WalletCreditProcessor work discovery", () => {
  it("processes only wallet-reported outstanding funding-credit work", async () => {
    const funding = {
      id: "funding-outstanding",
      accountId: "account-1",
      providerName: "development",
      providerReference: "dev-ref",
      canonicalAmount: Money.of(4000n, "USD"),
      collectionAmount: Money.of(4000n, "USD"),
      state: "confirmed",
      idempotencyKey: "wallet-credit-work",
    };
    const wallet = {
      findFundingCreditWork: vi
        .fn()
        .mockResolvedValueOnce([{ id: funding.id }])
        .mockResolvedValueOnce([]),
      findCreditByFunding: vi.fn(async () => null),
      createCredit: vi.fn(async () => undefined),
    };
    const fundingRepository = { findById: vi.fn(async () => funding) };
    const processor = new WalletCreditProcessor(fundingRepository as never, wallet as never, {
      transaction: async (operation) => operation(),
    });

    await processor.runBatch();
    await processor.runBatch();

    expect(wallet.findFundingCreditWork).toHaveBeenCalledTimes(2);
    expect(fundingRepository.findById).toHaveBeenCalledOnce();
    expect(fundingRepository.findById).toHaveBeenCalledWith(funding.id, {
      forUpdate: true,
    });
    expect(wallet.createCredit).toHaveBeenCalledOnce();
    expect(wallet.createCredit).toHaveBeenCalledWith(
      expect.objectContaining({
        fundingId: funding.id,
        amount: funding.canonicalAmount,
        state: "pending",
      }),
    );
  });
});
