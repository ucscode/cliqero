import { newId } from "@/kernel/ids";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import { Money } from "@/modules/money/money";
import type { ListingRepository } from "@/modules/listing";
import type { CheckoutRepository } from "@/modules/checkout/checkout";
import { Purchase, type PurchaseRepository } from "@/modules/purchase/purchase";
import type { PurchaseAttributionResolver } from "@/modules/referral/attribution";

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
        state: "awaiting_funds" as const,
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
}
