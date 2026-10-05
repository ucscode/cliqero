import type { Id } from "@/kernel/ids";
import type { Money } from "@/modules/money/money";
export type CheckoutState = "pending" | "paid" | "failed";
export interface Checkout {
  id: Id;
  buyerId: Id;
  listingId: Id;
  purchaseId: Id;
  amount: Money;
  state: CheckoutState;
  idempotencyKey: string;
  paidAt?: Date;
}
export interface CheckoutRepository {
  findById(id: Id, options?: { forUpdate?: boolean }): Promise<Checkout | null>;
  findByIdempotency(buyerId: Id, key: string): Promise<Checkout | null>;
  findForBuyer(
    buyerId: Id,
    input: { limit: number; before?: { createdAt: string; id: Id } },
  ): Promise<{ items: readonly Checkout[]; nextBoundary: { createdAt: string; id: Id } | null }>;
  save(value: Checkout): Promise<void>;
}
