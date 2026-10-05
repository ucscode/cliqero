import { newId } from "@/kernel/ids";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import { Money } from "@/modules/money/money";
import type { AccountDebtService } from "@/application/finance/account-debt";
import type { ListingRepository } from "@/modules/listing";
import type { Checkout, CheckoutRepository } from "@/modules/checkout/checkout";
import { Purchase, type PurchaseRepository } from "@/modules/purchase/purchase";
import type { PurchaseAttributionResolver } from "@/modules/referral/attribution";
import type { WalletRepository, WalletSummary } from "@/modules/wallet/wallet";
import type { EventOutbox } from "@/kernel/events";

export class WalletCheckoutService {
  constructor(
    private listings: ListingRepository,
    private checkouts: CheckoutRepository,
    private purchases: PurchaseRepository,
    private attribution: PurchaseAttributionResolver,
    private uow: UnitOfWork,
  ) {}
  async initiate(input: {
    buyerId: string;
    listingId: string;
    idempotencyKey: string;
    attributionSource?: string;
  }) {
    const prior = await this.checkouts.findByIdempotency(input.buyerId, input.idempotencyKey);
    if (prior) return prior;
    const listing = await this.listings.findById(input.listingId);
    if (!listing || listing.state !== "published") throw new Error("Listing not found");
    if (listing.price.currency !== "USD") throw new Error("Listings must use canonical USD");
    const snapshot = listing.commercialSnapshot();
    const resolvedAttribution = await this.attribution.resolve(input.attributionSource, listing.id);
    const attribution =
      resolvedAttribution?.referrerAccountId === input.buyerId ? null : resolvedAttribution;
    const checkoutId = newId(),
      purchaseId = newId();
    return this.uow.transaction(async () => {
      const existing = await this.checkouts.findByIdempotency(input.buyerId, input.idempotencyKey);
      if (existing) return existing;
      const checkout = {
        id: checkoutId,
        buyerId: input.buyerId,
        listingId: listing.id,
        purchaseId,
        amount: Money.of(listing.price.minorAmount, "USD"),
        state: "pending" as const,
        idempotencyKey: input.idempotencyKey,
      };
      const purchase = new Purchase(
        purchaseId,
        input.buyerId,
        null,
        {
          ...snapshot,
          canonicalPrice: { minorAmount: listing.price.minorAmount.toString(), currency: "USD" },
          referralAttributionId: attribution?.attributionId ?? null,
          referralReferrerAccountId: attribution?.referrerAccountId ?? null,
        },
        input.idempotencyKey,
        checkoutId,
      );
      await this.purchases.save(purchase);
      // The migrated relational key on checkouts.purchase_id references the
      // purchase row, so persist the two sides of this nullable cycle in
      // dependency order and link the purchase once the checkout exists.
      await this.checkouts.save(checkout);
      await this.purchases.save(purchase);
      return checkout;
    });
  }

  async listForBuyer(buyerId: string, limit = 50) {
    return this.checkouts.findForBuyer(buyerId, Math.max(1, Math.min(limit, 100)));
  }

  async getForBuyer(buyerId: string, checkoutId: string) {
    const checkout = await this.checkouts.findById(checkoutId);
    return checkout?.buyerId === buyerId ? checkout : null;
  }
}

export type WalletCheckoutPaymentResult = {
  checkout: Checkout;
  wallet: WalletSummary;
  shortfall: Money;
};

export class WalletCheckoutPaymentService {
  constructor(
    private checkouts: CheckoutRepository,
    private wallet: WalletRepository,
    private purchases: PurchaseRepository,
    private uow: UnitOfWork,
    private outbox: EventOutbox,
    private debt?: AccountDebtService,
  ) {}

  async pay(input: { buyerId: string; checkoutId: string }): Promise<WalletCheckoutPaymentResult> {
    return this.uow.transaction(async () => {
      const checkout = await this.checkouts.findById(input.checkoutId, { forUpdate: true });
      if (!checkout || checkout.buyerId !== input.buyerId) throw new Error("Checkout not found");
      if (checkout.state === "failed") throw new Error("Checkout failed");

      // A zero-price listing is acquired through the same persisted checkout
      // and purchase, but has no monetary wallet operation. The checkout row
      // lock and transaction keep retries/concurrent requests idempotent.
      if (checkout.amount.minorAmount === 0n) {
        if (checkout.state !== "paid") {
          await this.debt?.requireNoOutstanding(checkout.buyerId, "purchase");
          checkout.state = "paid";
          checkout.paidAt = new Date();
          await this.checkouts.save(checkout);
          const purchase = await this.purchases.findById(checkout.purchaseId, { forUpdate: true });
          if (!purchase) throw new Error("Purchase not found");
          purchase.markPaid();
          purchase.complete();
          await this.purchases.save(purchase);
          const occurredAt = new Date();
          await this.outbox.append([
            {
              id: newId(),
              name: "purchase.completed",
              aggregateId: purchase.id,
              occurredAt,
              correlationId: purchase.id,
              payload: { free: true },
            },
          ]);
        }
        return {
          checkout,
          wallet: await this.wallet.summary(checkout.buyerId),
          shortfall: Money.of(0n, checkout.amount.currency),
        };
      }

      await this.wallet.lockAccount(checkout.buyerId);
      if (checkout.state === "paid") {
        const wallet = await this.wallet.summary(checkout.buyerId);
        return { checkout, wallet, shortfall: Money.of(0n, "USD") };
      }

      const existingDebit = await this.wallet.findDebitByCheckout(checkout.id);
      if (existingDebit) {
        checkout.state = "paid";
        checkout.paidAt ??= new Date();
        await this.checkouts.save(checkout);
        await this.markPurchasePaid(checkout.purchaseId);
        const wallet = await this.wallet.summary(checkout.buyerId);
        return { checkout, wallet, shortfall: Money.of(0n, "USD") };
      }

      await this.debt?.requireNoOutstanding(checkout.buyerId, "purchase");

      const wallet = await this.wallet.summary(checkout.buyerId, { forUpdate: true });
      const shortfallMinor =
        checkout.amount.minorAmount > wallet.available.minorAmount
          ? checkout.amount.minorAmount - wallet.available.minorAmount
          : 0n;
      if (shortfallMinor > 0n)
        return {
          checkout,
          wallet,
          shortfall: Money.of(shortfallMinor, checkout.amount.currency),
        };

      await this.wallet.createDebit({
        id: newId(),
        accountId: checkout.buyerId,
        checkoutId: checkout.id,
        amount: checkout.amount,
      });
      checkout.state = "paid";
      checkout.paidAt = new Date();
      await this.checkouts.save(checkout);
      await this.markPurchasePaid(checkout.purchaseId);
      return {
        checkout,
        wallet: await this.wallet.summary(checkout.buyerId),
        shortfall: Money.of(0n, "USD"),
      };
    });
  }

  private async markPurchasePaid(purchaseId: string) {
    const purchase = await this.purchases.findById(purchaseId, { forUpdate: true });
    if (!purchase) throw new Error("Purchase not found");
    if (purchase.state === "pending") {
      purchase.markPaid();
      await this.purchases.save(purchase);
    }
  }
}
