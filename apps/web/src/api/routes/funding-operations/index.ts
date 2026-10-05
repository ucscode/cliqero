import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../shared/context";
import { domainError } from "../../shared/error";
import { errorSchema } from "../../shared/schemas";
import {
  fundingStateSchema,
  operatorFundingDetailSchema,
  operatorFundingSummarySchema,
} from "./contracts";
import { crudMaxRows } from "@/config/crud";

export function registerFundingOperationsRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  const maxRows = crudMaxRows();
  const operatorFundingQuery = z.object({
    search: z.string().max(100).optional(),
    state: fundingStateSchema.optional(),
    provider: z
      .string()
      .regex(/^[a-z0-9_-]{1,50}$/)
      .optional(),
    sort: z
      .enum(["created", "amount"])
      .default("created")
      .describe("Sort by creation date or canonical funding amount."),
    direction: z.enum(["asc", "desc"]).default("desc").describe("Sort direction."),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(maxRows).default(maxRows),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/funding",
      request: { query: operatorFundingQuery },
      responses: {
        200: {
          description: "Bounded funding administration view",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(operatorFundingSummarySchema),
                nextCursor: z.string().nullable(),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Funding management permission required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "finance.read", "payments:read");
      if (denied) return denied;
      try {
        return c.json(await container.operatorFunding.list(c.req.valid("query")), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/funding/{fundingId}",
      request: { params: z.object({ fundingId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Safe funding administration detail",
          content: { "application/json": { schema: operatorFundingDetailSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Funding management permission required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Funding not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "finance.read", "payments:read");
      if (denied) return denied;
      try {
        return c.json(await container.operatorFunding.get(c.req.valid("param").fundingId), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/funding/{fundingId}/reconcile-credit",
      tags: ["Funding Transactions"],
      summary: "Repair a missing confirmed funding credit",
      description:
        "Checks the persisted confirmed funding and runs the normal idempotent wallet-credit and availability processors. It does not call the provider or alter payment evidence.",
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
      const principal = requirePrincipal(c);
      if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
      const denied = requireCapabilityScope(c, principal, "finance.manage", "payments:manage");
      if (denied) return denied;
      try {
        return c.json(
          await container.fundingCreditReconciliation.reconcile({
            actorId: principal.accountId,
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
