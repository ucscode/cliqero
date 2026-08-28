import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Id } from "@/kernel/ids";
import { newId } from "@/kernel/ids";
import type { EntitlementRepository } from "@/modules/entitlement/entitlement";

export type AccessGrantState = "active" | "revoked";

export class AccessGrant {
  private stateValue: AccessGrantState = "active";
  private constructor(readonly id: Id, readonly entitlementId: Id, readonly tokenHash: Buffer) {}

  static issue(entitlementId: Id): { grant: AccessGrant; source: string } {
    const source = randomBytes(32).toString("base64url");
    return { grant: new AccessGrant(newId(), entitlementId, AccessGrant.hash(source)), source };
  }

  static restore(id: Id, entitlementId: Id, tokenHash: Buffer, state: AccessGrantState): AccessGrant {
    const grant = new AccessGrant(id, entitlementId, tokenHash);
    grant.stateValue = state;
    return grant;
  }

  matches(source: string): boolean {
    const candidate = AccessGrant.hash(source);
    return candidate.length === this.tokenHash.length && timingSafeEqual(candidate, this.tokenHash);
  }

  revoke(): void { this.stateValue = "revoked"; }
  get isActive() { return this.stateValue === "active"; }
  get state() { return this.stateValue; }
  private static hash(source: string) { return createHash("sha256").update(source, "utf8").digest(); }
}

export interface AccessGrantRepository {
  findByTokenHash(tokenHash: Buffer): Promise<AccessGrant | null>;
  save(grant: AccessGrant, idempotencyKey?: string): Promise<void>;
}

export interface IntegrationPrincipal {
  readonly id: Id;
  canVerifyListing(listingId: Id): boolean;
}

export class AccessService {
  constructor(private readonly entitlements: EntitlementRepository, private readonly grants: AccessGrantRepository) {}

  async issue(buyerId: Id, listingId: Id, idempotencyKey?: string): Promise<{ grant: AccessGrant; source: string }> {
    const entitlement = await this.entitlements.findActive(buyerId, listingId);
    if (!entitlement) throw new Error("Active entitlement not found");
    const issued = AccessGrant.issue(entitlement.id);
    await this.grants.save(issued.grant, idempotencyKey);
    return issued;
  }

  async verify(source: string, integration: IntegrationPrincipal): Promise<{ authorized: boolean; listingId?: Id; entitlementId?: Id; buyerId?: Id }> {
    const tokenHash = createHash("sha256").update(source, "utf8").digest();
    const grant = await this.grants.findByTokenHash(tokenHash);
    if (!grant?.isActive || !grant.matches(source)) return { authorized: false };
    const entitlement = await this.entitlements.findById(grant.entitlementId);
    if (!entitlement?.isActive || !integration.canVerifyListing(entitlement.listingId)) return { authorized: false };
    return { authorized: true, listingId: entitlement.listingId, entitlementId: entitlement.id, buyerId: entitlement.buyerId };
  }
}
