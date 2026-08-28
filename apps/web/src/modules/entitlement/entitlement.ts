import type { Id } from "@/kernel/ids";

export type EntitlementState = "active" | "revoked";

export class Entitlement {
  private stateValue: EntitlementState = "active";
  constructor(readonly id: Id, readonly buyerId: Id, readonly listingId: Id, readonly purchaseId: Id) {}
  static restore(id: Id, buyerId: Id, listingId: Id, purchaseId: Id, state: EntitlementState): Entitlement {
    const entitlement = new Entitlement(id, buyerId, listingId, purchaseId);
    entitlement.stateValue = state;
    return entitlement;
  }
  revoke(): void { this.stateValue = "revoked"; }
  get state() { return this.stateValue; }
  get isActive() { return this.stateValue === "active"; }
}

export interface EntitlementRepository {
  findByPurchaseId(purchaseId: Id): Promise<Entitlement | null>;
  findActive(buyerId: Id, listingId: Id): Promise<Entitlement | null>;
  findById(id: Id): Promise<Entitlement | null>;
  save(entitlement: Entitlement): Promise<void>;
}
