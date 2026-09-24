import { PublicApplicationError, DomainInvariantError } from "@/kernel/errors";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { AuditRecorder } from "@/application/shared/audit";
import type { ScopedIntegration } from "@/modules/access/integrations";
import {
  Entitlement,
  type EntitlementRepository,
  type EntitlementState,
} from "@/modules/entitlement/entitlement";

export interface EntitlementPatch {
  state?: EntitlementState;
  expiresAt?: Date | null;
}

export interface PackageEntitlementView {
  id: string;
  listing_id: string;
  state: EntitlementState;
  expires_at: string | null;
  access_available: boolean;
}

export class PackageEntitlementService {
  constructor(
    private readonly entitlements: EntitlementRepository,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditRecorder,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async get(
    integration: ScopedIntegration,
    entitlementId: string,
  ): Promise<PackageEntitlementView> {
    const entitlement = await this.entitlements.findById(entitlementId);
    this.assertVisible(integration, entitlement);
    return this.view(entitlement);
  }

  async update(
    integration: ScopedIntegration,
    entitlementId: string,
    patch: EntitlementPatch,
  ): Promise<PackageEntitlementView> {
    return this.uow.transaction(async () => {
      const entitlement = await this.entitlements.findById(entitlementId, { forUpdate: true });
      this.assertVisible(integration, entitlement);

      const now = this.now();
      const nextState = patch.state ?? entitlement.state;
      const nextExpiry = Object.hasOwn(patch, "expiresAt")
        ? (patch.expiresAt ?? null)
        : entitlement.expiresAt;
      if (nextState === "active" && nextExpiry !== null && nextExpiry.valueOf() <= now.valueOf()) {
        throw new PublicApplicationError(
          "An active entitlement must expire in the future.",
          "invalid_entitlement_expiry",
          400,
        );
      }

      const previous = this.auditState(entitlement);
      let changed = false;
      try {
        if (patch.state !== undefined) changed = entitlement.transitionTo(patch.state) || changed;
        if (Object.hasOwn(patch, "expiresAt"))
          changed = entitlement.setExpiresAt(patch.expiresAt ?? null) || changed;
      } catch (error) {
        if (error instanceof DomainInvariantError)
          throw new PublicApplicationError(error.message, "entitlement_transition_conflict", 409);
        throw error;
      }

      if (changed) {
        await this.entitlements.save(entitlement);
        await this.audit.record({
          actorId: integration.ownerId,
          action: "entitlement.updated",
          subjectType: "entitlement",
          subjectId: entitlement.id,
          previousState: previous,
          newState: this.auditState(entitlement),
        });
      }
      return this.view(entitlement, now);
    });
  }

  private assertVisible(
    integration: ScopedIntegration,
    entitlement: Entitlement | null,
  ): asserts entitlement is Entitlement {
    if (!entitlement || !integration.canVerifyListing(entitlement.listingId))
      throw new PublicApplicationError("Entitlement not found", "not_found", 404);
  }

  private view(entitlement: Entitlement, now = this.now()): PackageEntitlementView {
    return {
      id: entitlement.id,
      listing_id: entitlement.listingId,
      state: entitlement.state,
      expires_at: entitlement.expiresAt?.toISOString() ?? null,
      access_available: entitlement.isUsableAt(now),
    };
  }

  private auditState(entitlement: Entitlement) {
    return {
      state: entitlement.state,
      expires_at: entitlement.expiresAt?.toISOString() ?? null,
    };
  }
}
