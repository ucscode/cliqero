import type { Id } from "@/kernel/ids";
import { DomainInvariantError } from "@/kernel/errors";

export type EntitlementState = "active" | "consumed" | "revoked" | "expired";

export class Entitlement {
  private stateValue: EntitlementState;
  private expiresAtValue: Date | null;

  constructor(
    readonly id: Id,
    readonly buyerId: Id,
    readonly listingId: Id,
    readonly purchaseId: Id,
    expiresAt: Date | null = null,
  ) {
    this.stateValue = "active";
    this.expiresAtValue = expiresAt;
  }

  static restore(
    id: Id,
    buyerId: Id,
    listingId: Id,
    purchaseId: Id,
    state: EntitlementState,
    expiresAt: Date | null = null,
  ): Entitlement {
    const entitlement = new Entitlement(id, buyerId, listingId, purchaseId, expiresAt);
    entitlement.stateValue = state;
    return entitlement;
  }

  consume(): boolean {
    return this.transitionTo("consumed");
  }

  revoke(): boolean {
    return this.transitionTo("revoked");
  }

  expire(): boolean {
    return this.transitionTo("expired");
  }

  transitionTo(state: EntitlementState): boolean {
    if (this.stateValue === state) return false;
    if (this.stateValue !== "active") {
      throw new DomainInvariantError(
        `An entitlement in ${this.stateValue} state cannot transition to ${state}`,
      );
    }
    this.stateValue = state;
    return true;
  }

  setExpiresAt(expiresAt: Date | null): boolean {
    if (expiresAt && Number.isNaN(expiresAt.valueOf()))
      throw new DomainInvariantError("Entitlement expiry must be a valid date");
    if (this.expiresAtValue?.valueOf() === expiresAt?.valueOf()) return false;
    this.expiresAtValue = expiresAt;
    return true;
  }

  get state(): EntitlementState {
    return this.stateValue;
  }

  get expiresAt(): Date | null {
    return this.expiresAtValue;
  }

  get isActive(): boolean {
    return this.isUsableAt(new Date());
  }

  isUsableAt(now: Date): boolean {
    return (
      this.stateValue === "active" && (this.expiresAtValue === null || this.expiresAtValue > now)
    );
  }
}

export interface EntitlementRepository {
  findByPurchaseId(purchaseId: Id): Promise<Entitlement | null>;
  findActive(buyerId: Id, listingId: Id): Promise<Entitlement | null>;
  findById(id: Id, options?: { forUpdate?: boolean }): Promise<Entitlement | null>;
  save(entitlement: Entitlement): Promise<void>;
}
