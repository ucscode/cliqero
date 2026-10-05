import { PublicApplicationError } from "@/kernel/errors";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { IdempotencyStore } from "@/application/checkout/contracts";
import type { AuditRecorder } from "@/application/shared/audit";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import type { Entitlement, EntitlementRepository } from "@/modules/entitlement/entitlement";
import type { PurchaseRepository } from "@/modules/purchase/purchase";

export interface PurchaseEntitlementIssuance {
  process(purchaseId: string): Promise<Entitlement | null>;
}

export type PurchaseEntitlementRepair = {
  purchaseId: string;
  entitlementId: string;
  state: string;
  applied: boolean;
};

/** Repairs only the derived entitlement, using the same issuance processor as commerce completion. */
export class PurchaseEntitlementReconciliationService {
  constructor(
    private readonly purchases: PurchaseRepository,
    private readonly entitlements: EntitlementRepository,
    private readonly issuance: PurchaseEntitlementIssuance,
    private readonly operators: OperatorAuthorizationService,
    private readonly idempotency: IdempotencyStore,
    private readonly audit: AuditRecorder,
    private readonly uow: UnitOfWork,
  ) {}

  async reconcile(input: { actorId: string; purchaseId: string; idempotencyKey: string }) {
    await this.operators.requireCapability(input.actorId, "finance.manage");
    const key = input.idempotencyKey.trim();
    if (!key || key.length > 200)
      throw new PublicApplicationError(
        "A valid Idempotency-Key is required.",
        "invalid_idempotency_key",
        400,
      );

    return this.uow.transaction(async () => {
      const scope = "purchase-entitlement-reconciliation";
      if (!(await this.idempotency.begin(scope, key))) {
        const previous = await this.idempotency.findCompleted(scope, key);
        if (!previous || previous.resultReference !== input.purchaseId)
          throw new PublicApplicationError(
            "Idempotency key was used for another entitlement repair.",
            "idempotency_conflict",
            409,
          );
        return previous.response as PurchaseEntitlementRepair;
      }

      const purchase = await this.purchases.findById(input.purchaseId, { forUpdate: true });
      if (!purchase) throw new PublicApplicationError("Purchase not found.", "not_found", 404);
      if (purchase.state !== "paid" && purchase.state !== "completed")
        throw new PublicApplicationError(
          "Only a paid or completed purchase can receive an entitlement.",
          "purchase_state_conflict",
          409,
        );

      const existing = await this.entitlements.findByPurchaseId(purchase.id);
      const issued = await this.issuance.process(purchase.id);
      const entitlement = issued ?? (await this.entitlements.findByPurchaseId(purchase.id));
      if (!entitlement)
        throw new PublicApplicationError(
          "The purchase entitlement could not be reconciled.",
          "entitlement_unavailable",
          409,
        );

      const result: PurchaseEntitlementRepair = {
        purchaseId: purchase.id,
        entitlementId: entitlement.id,
        state: entitlement.state,
        applied: existing === null,
      };
      await this.audit.record({
        actorId: input.actorId,
        action: "purchase.entitlement.reconciled",
        subjectType: "purchase",
        subjectId: purchase.id,
        previousState: existing ? { entitlementId: existing.id, state: existing.state } : null,
        newState: result,
      });
      await this.idempotency.complete(scope, key, purchase.id, result);
      return result;
    });
  }
}
