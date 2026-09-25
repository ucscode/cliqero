import { describe, expect, it } from "vitest";
import { WalletCheckoutPaymentService } from "@/application/checkout/wallet";
import { newId } from "@/kernel/ids";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import { Money } from "@/modules/money/money";
import type { Checkout, CheckoutRepository } from "@/modules/checkout/checkout";
import { Purchase, type PurchaseRepository } from "@/modules/purchase/purchase";
import type { WalletDebit, WalletRepository } from "@/modules/wallet/wallet";

describe("WalletCheckoutPaymentService", () => {
  it("does not pay a pending checkout when funding becomes available, then debits once on Pay now", async () => {
    const buyerId = newId();
    const listingId = newId();
    const checkoutId = newId();
    const purchaseId = newId();
    const checkout: Checkout = {
      id: checkoutId,
      buyerId,
      listingId,
      purchaseId,
      amount: Money.of(1400n, "USD"),
      state: "pending",
      idempotencyKey: "buy-1",
    };
    const purchase = new Purchase(
      purchaseId,
      buyerId,
      null,
      {
        listingId,
        sellerId: newId(),
        title: "Wallet item",
        shortDescription: "Short",
        longDescription: "Long",
        price: { minorAmount: "1400", currency: "USD" },
        canonicalPrice: { minorAmount: "1400", currency: "USD" },
        referralAttributionId: null,
        referralReferrerAccountId: null,
      },
      "buy-1",
      checkoutId,
    );
    let available = 0n;
    const debits: WalletDebit[] = [];
    const checkoutRepository: CheckoutRepository = {
      findById: async () => checkout,
      findByIdempotency: async () => null,
      save: async (value) => {
        Object.assign(checkout, value);
      },
    };
    const purchaseRepository: PurchaseRepository = {
      findById: async () => purchase,
      findByIdempotencyKey: async () => null,
      save: async () => undefined,
    };
    const walletRepository: WalletRepository = {
      summary: async () => ({
        currency: "USD",
        available: Money.of(
          available - debits.reduce((sum, debit) => sum + debit.amount.minorAmount, 0n),
          "USD",
        ),
        pending: Money.of(0n, "USD"),
      }),
      findCreditByFunding: async () => null,
      findFundingCreditWork: async () => [],
      findPendingCredits: async () => [],
      createCredit: async () => undefined,
      makeCreditAvailable: async () => undefined,
      findDebitByCheckout: async (id) => debits.find((debit) => debit.checkoutId === id) ?? null,
      createDebit: async (debit) => {
        debits.push(debit);
      },
      history: async () => [],
      lockAccount: async () => undefined,
    };
    const service = new WalletCheckoutPaymentService(
      checkoutRepository,
      walletRepository,
      purchaseRepository,
      { transaction: async (work) => work() } as UnitOfWork,
    );

    const insufficient = await service.pay({ buyerId, checkoutId });
    expect(insufficient.checkout.state).toBe("pending");
    expect(insufficient.shortfall.minorAmount).toBe(1400n);
    expect(debits).toHaveLength(0);
    expect(purchase.state).toBe("pending");

    available = 2500n;
    const paid = await service.pay({ buyerId, checkoutId });
    expect(paid.checkout.state).toBe("paid");
    expect(paid.wallet.available.minorAmount).toBe(1100n);
    expect(purchase.state).toBe("paid");
    expect(debits).toHaveLength(1);

    const retry = await service.pay({ buyerId, checkoutId });
    expect(retry.checkout.state).toBe("paid");
    expect(retry.wallet.available.minorAmount).toBe(1100n);
    expect(debits).toHaveLength(1);
  });
});
