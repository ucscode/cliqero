import { describe, expect, it, vi } from "vitest";
import { WalletCheckoutPaymentService } from "@/application/checkout/wallet";
import { newId } from "@/kernel/ids";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import { Money } from "@/modules/money/money";
import type { Checkout, CheckoutRepository } from "@/modules/checkout/checkout";
import { Purchase, type PurchaseRepository } from "@/modules/purchase/purchase";
import type { WalletDebit, WalletRepository } from "@/modules/wallet/wallet";

describe("WalletCheckoutPaymentService", () => {
  it("acquires a zero-price checkout without wallet movement and remains idempotent", async () => {
    const buyerId = newId();
    const checkoutId = newId();
    const purchaseId = newId();
    const listingId = newId();
    const checkout: Checkout = {
      id: checkoutId,
      buyerId,
      listingId,
      purchaseId,
      amount: Money.of(0n, "USD"),
      state: "pending",
      idempotencyKey: "free-listing-1",
    };
    const purchase = new Purchase(
      purchaseId,
      buyerId,
      null,
      {
        listingId,
        sellerId: newId(),
        title: "Free listing",
        shortDescription: "No charge",
        longDescription: "Free access",
        price: { minorAmount: "0", currency: "USD" },
        canonicalPrice: { minorAmount: "0", currency: "USD" },
        referralAttributionId: null,
        referralReferrerAccountId: null,
      },
      checkout.idempotencyKey,
      checkoutId,
    );
    const checkoutRepository = {
      findById: vi.fn(async () => checkout),
      save: vi.fn(async (value: Checkout) => Object.assign(checkout, value)),
    } as unknown as CheckoutRepository;
    const purchaseRepository = {
      findById: vi.fn(async () => purchase),
      save: vi.fn(async () => undefined),
    } as unknown as PurchaseRepository;
    const walletRepository = {
      summary: vi.fn(async () => ({
        currency: "USD",
        available: Money.of(0n, "USD"),
        pending: Money.of(0n, "USD"),
      })),
      lockAccount: vi.fn(async () => undefined),
      findDebitByCheckout: vi.fn(async () => null),
      createDebit: vi.fn(async () => undefined),
    } as unknown as WalletRepository;
    const append = vi.fn(async () => undefined);
    const service = new WalletCheckoutPaymentService(
      checkoutRepository,
      walletRepository,
      purchaseRepository,
      { transaction: async (work) => work() } as UnitOfWork,
      { append },
    );

    await expect(service.pay({ buyerId: newId(), checkoutId })).rejects.toThrow(
      "Checkout not found",
    );
    expect(checkoutRepository.save).not.toHaveBeenCalled();
    const result = await service.pay({ buyerId, checkoutId });
    expect(result).toMatchObject({
      checkout: { state: "paid", amount: Money.of(0n, "USD") },
      shortfall: Money.of(0n, "USD"),
    });
    expect(purchase.state).toBe("completed");
    expect(walletRepository.lockAccount).not.toHaveBeenCalled();
    expect(walletRepository.createDebit).not.toHaveBeenCalled();

    await service.pay({ buyerId, checkoutId });
    expect(checkoutRepository.save).toHaveBeenCalledOnce();
    expect(purchaseRepository.save).toHaveBeenCalledOnce();
    expect(walletRepository.createDebit).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledWith([expect.objectContaining({ name: "purchase.completed" })]);
  });

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
      { append: vi.fn(async () => undefined) },
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
