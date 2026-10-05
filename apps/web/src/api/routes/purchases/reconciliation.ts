import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../shared/context";
import { domainError } from "../../shared/error";
import { errorSchema } from "../../shared/schemas";

const purchaseEntitlementState = z.enum(["active", "consumed", "expired", "revoked"]);

export function registerPurchaseReconciliationRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/purchases/{purchaseId}/reconcile-entitlement",
      tags: ["Purchases"],
      summary: "Reconcile a missing purchase entitlement",
      description:
        "Uses normal idempotent entitlement issuance for a paid purchase whose entitlement is missing. Purchase and payment evidence remain unchanged.",
      request: {
        params: z.object({ purchaseId: z.uuid() }),
        headers: z.object({
          "idempotency-key": z
            .string()
            .min(1)
            .max(200)
            .openapi({ example: "entitlement-repair-2026-001" }),
        }),
      },
      responses: {
        200: {
          description: "Idempotent purchase-entitlement reconciliation result",
          content: {
            "application/json": {
              schema: z
                .object({
                  purchase_id: z.uuid(),
                  entitlement_id: z.uuid(),
                  state: purchaseEntitlementState,
                  applied: z.boolean(),
                })
                .openapi({
                  example: {
                    purchase_id: "8f1fd548-3cc9-4c15-8cf9-31c46e4d3488",
                    entitlement_id: "27ddf1f8-0a69-4a56-a755-8d7b3f966a79",
                    state: "active",
                    applied: true,
                  },
                }),
            },
          },
        },
        400: {
          description: "Invalid purchase ID or idempotency key",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Finance management permission required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Purchase not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Purchase is not eligible or idempotency key conflicts",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const principal = requirePrincipal(c);
      if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
      const denied = requireCapabilityScope(c, principal, "finance.manage", "payments:manage");
      if (denied) return denied;
      try {
        const result = await container.purchaseEntitlementReconciliation.reconcile({
          actorId: principal.accountId,
          purchaseId: c.req.valid("param").purchaseId,
          idempotencyKey: c.req.header("idempotency-key")!,
        });
        return c.json(
          {
            purchase_id: result.purchaseId,
            entitlement_id: result.entitlementId,
            state: purchaseEntitlementState.parse(result.state),
            applied: result.applied,
          },
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
