import type { Id } from "@/kernel/ids";

export type EntitlementState = "active" | "revoked" | "expired";

export class Entitlement {
  private stateValue: EntitlementState = "active";
  constructor(readonly id: Id, readonly buyerId: Id, readonly listingId: Id, readonly purchaseId: Id,readonly expiresAt:Date|null=null) {}
  static restore(id: Id, buyerId: Id, listingId: Id, purchaseId: Id, state: EntitlementState,expiresAt:Date|null=null): Entitlement {
    const entitlement = new Entitlement(id, buyerId, listingId, purchaseId,expiresAt);
    entitlement.stateValue = state;
    return entitlement;
  }
  revoke(): void { this.stateValue = "revoked"; }
  get state() { return this.stateValue; }
  get isActive() { return this.isUsableAt(new Date()); }
  isUsableAt(now:Date) { return this.stateValue === "active" && (this.expiresAt===null||this.expiresAt>now); }
}

export interface EntitlementRepository {
  findByPurchaseId(purchaseId: Id): Promise<Entitlement | null>;
  findActive(buyerId: Id, listingId: Id): Promise<Entitlement | null>;
  findById(id: Id): Promise<Entitlement | null>;
  save(entitlement: Entitlement): Promise<void>;
}
