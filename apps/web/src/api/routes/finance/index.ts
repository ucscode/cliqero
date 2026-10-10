import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../shared/context";
import { domainError } from "../../shared/error";
import { errorSchema } from "../../shared/schemas";
import {
  operatorDistributionDetailSchema,
  operatorDistributionSummarySchema,
  operatorEarningsEntrySchema,
} from "./contracts";
import { crudMaxRows } from "@/config/crud";

export function registerFinanceRoutes(app: OpenAPIHono<Env>, container: ApplicationContainer) {
  const maxRows = crudMaxRows();
  const operatorDistributionQuery = z.object({
    search: z.string().max(100).optional(),
    sort: z
      .enum(["created", "amount"])
      .default("created")
      .describe("Sort by completion date or gross amount."),
    direction: z.enum(["asc", "desc"]).default("desc").describe("Sort direction."),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(maxRows).default(maxRows),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/distributions",
      request: { query: operatorDistributionQuery },
      responses: {
        200: {
          description: "Bounded distribution administration view",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(operatorDistributionSummarySchema),
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
          description: "Finance read permission required",
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
        return c.json(await container.operatorDistributions.list(c.req.valid("query")), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/distributions/{distributionId}",
      request: { params: z.object({ distributionId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Safe distribution administration detail",
          content: { "application/json": { schema: operatorDistributionDetailSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Finance read permission required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Distribution not found",
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
        return c.json(
          await container.operatorDistributions.get(c.req.valid("param").distributionId),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  const operatorEarningsQuery = z.object({
    search: z.string().max(100).optional(),
    state: z
      .enum(["pending", "available", "partially_corrected", "corrected", "reversed"])
      .optional(),
    sort: z
      .enum(["created", "amount"])
      .default("created")
      .describe("Sort by entry date or amount."),
    direction: z.enum(["asc", "desc"]).default("desc").describe("Sort direction."),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(maxRows).default(maxRows),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/earnings/entries",
      request: { query: operatorEarningsQuery },
      responses: {
        200: {
          description: "Bounded earnings administration view",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(operatorEarningsEntrySchema),
                nextCursor: z.string().nullable(),
                totals: z.object({
                  pendingMinor: z.string(),
                  availableMinor: z.string(),
                  reservedMinor: z.string(),
                }),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Finance read permission required",
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
        return c.json(await container.operatorEarnings.list(c.req.valid("query")), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );

  const earningsAdjustmentSchema = z.object({
    id: z.uuid(),
    accountId: z.uuid(),
    accountUsername: z.string(),
    amountMinor: z.string(),
    reason: z.string(),
    reference: z.string().nullable(),
    createdBy: z.uuid(),
    createdAt: z.string().datetime(),
    currentBalanceMinor: z.string().nullable().optional(),
  });
  const adjustmentQuery = z.object({
    search: z.string().max(100).optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(maxRows).default(maxRows),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/earnings/adjustments",
      tags: ["Earnings Adjustments"],
      summary: "List earnings adjustments",
      description:
        "Lists immutable earnings correction facts with their account, reason, creator, and deterministic pagination.",
      request: { query: adjustmentQuery },
      responses: {
        200: {
          description: "Earnings adjustments",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(earningsAdjustmentSchema),
                nextCursor: z.string().nullable(),
                summary: z.object({
                  creditMinor: z.string(),
                  debitMinor: z.string(),
                  netMinor: z.string(),
                }),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Finance read permission required",
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
        return c.json(
          await container.earningsAdjustments.list(p.accountId, c.req.valid("query")),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/earnings/adjustments",
      tags: ["Earnings Adjustments"],
      summary: "Create an earnings adjustment",
      description:
        "Posts an immutable positive manual Earnings credit. Negative recoveries use the source-linked Earnings corrections resource. Idempotency-Key makes retries safe; reusing a key for different normalized intent conflicts.",
      request: {
        headers: z.object({ "idempotency-key": z.string().trim().min(1).max(200) }),
        body: {
          content: {
            "application/json": {
              schema: z
                .object({
                  account_id: z.uuid(),
                  amount_minor: z
                    .string()
                    .regex(/^[1-9]\d{0,18}$/)
                    .max(19),
                  reason: z.string().trim().min(1).max(1000),
                  reference: z.string().trim().max(200).nullable().optional(),
                })
                .strict(),
            },
          },
        },
      },
      responses: {
        200: {
          description: "Previously posted adjustment returned for an idempotent retry",
          content: { "application/json": { schema: earningsAdjustmentSchema } },
        },
        201: {
          description: "Earnings adjustment posted",
          content: { "application/json": { schema: earningsAdjustmentSchema } },
        },
        400: {
          description: "Invalid adjustment",
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
        409: {
          description: "Idempotency-Key was already used for a different adjustment",
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
        const body = c.req.valid("json");
        const result = await container.earningsAdjustments.create(p.accountId, {
          accountId: body.account_id,
          amountMinor: body.amount_minor,
          reason: body.reason,
          reference: body.reference,
          idempotencyKey: c.req.header("Idempotency-Key")!,
        });
        return c.json(result.adjustment, result.created ? 201 : 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/earnings/adjustments/{adjustmentId}",
      tags: ["Earnings Adjustments"],
      summary: "Get an earnings adjustment",
      description: "Returns one immutable earnings correction fact.",
      request: { params: z.object({ adjustmentId: z.uuid() }) },
      responses: {
        200: {
          description: "Earnings adjustment",
          content: { "application/json": { schema: earningsAdjustmentSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Finance read permission required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Earnings adjustment not found",
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
        return c.json(
          await container.earningsAdjustments.get(p.accountId, c.req.valid("param").adjustmentId),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
