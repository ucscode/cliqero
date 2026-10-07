import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../shared/context";
import { domainError } from "../../shared/error";
import { errorSchema } from "../../shared/schemas";

export function registerFundingOperationsRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/funding-transactions/{fundingId}/reconcile-credit",
      tags: ["Funding Transactions"],
      summary: "Reconcile funding credit",
      description:
        "Idempotently repairs a missing wallet-credit effect for a confirmed funding transaction without changing its evidence.",
      request: {
        params: z.object({ fundingId: z.uuid() }),
        headers: z.object({ "idempotency-key": z.string().trim().min(1).max(200) }),
      },
      responses: {
        200: {
          description: "Funding credit reconciliation result",
          content: {
            "application/json": {
              schema: z.object({
                fundingId: z.uuid(),
                creditId: z.uuid(),
                state: z.literal("available"),
                applied: z.boolean(),
              }),
            },
          },
        },
        400: {
          description: "Invalid idempotency key",
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
          description: "Funding not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Funding is unconfirmed, credit is unavailable, or key conflicts",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "finance.manage", "payments:manage");
      if (denied) return denied;
      try {
        return c.json(
          await container.fundingCreditReconciliation.reconcile({
            actorId: p.accountId,
            fundingId: c.req.valid("param").fundingId,
            idempotencyKey: c.req.header("idempotency-key")!,
          }),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
