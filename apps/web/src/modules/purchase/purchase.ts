import { DomainInvariantError } from "@/kernel/errors";
import type { Id } from "@/kernel/ids";

export type PurchaseState = "pending" | "paid" | "completed" | "failed" | "refunded";
export interface PurchaseTerms {
  readonly listingId: Id;
  readonly sellerId: Id;
  readonly title: string;
  readonly price: { readonly minorAmount: string; readonly currency: string };
  readonly canonicalPrice: { readonly minorAmount: string; readonly currency: "USD" };
  readonly referralAttributionId: Id | null;
  readonly referralLinkId: Id | null;
  readonly referralReferrerAccountId: Id | null;
}

export class Purchase {
  private stateValue: PurchaseState = "pending";

  constructor(
    readonly id: Id,
    readonly buyerId: Id,
    readonly paymentId: Id,
    readonly terms: PurchaseTerms,
    readonly idempotencyKey: string,
  ) {
    if (!idempotencyKey.trim()) throw new DomainInvariantError("Purchase idempotency key is required");
    Object.freeze(terms.price);
    Object.freeze(terms.canonicalPrice);
    Object.freeze(terms);
  }

  static restore(input: {
    id: Id; buyerId: Id; paymentId: Id; terms: PurchaseTerms; idempotencyKey: string; state: PurchaseState;
  }): Purchase {
    const purchase = new Purchase(input.id, input.buyerId, input.paymentId, input.terms, input.idempotencyKey);
    purchase.stateValue = input.state;
    return purchase;
  }

  markPaid(): void {
    if (this.stateValue !== "pending") throw new DomainInvariantError("Only a pending purchase can be marked paid");
    this.stateValue = "paid";
  }

  complete(): void {
    if (this.stateValue !== "paid") throw new DomainInvariantError("Only a paid purchase can be completed");
    this.stateValue = "completed";
  }

  get state() { return this.stateValue; }
}

export interface PurchaseRepository {
  findById(id: Id, options?: { forUpdate?: boolean }): Promise<Purchase | null>;
  findByIdempotencyKey(key: string): Promise<Purchase | null>;
  save(purchase: Purchase): Promise<void>;
}
