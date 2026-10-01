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
  const purchaseQuery = z.object({
    buyer: z.uuid().optional(),
    listing: z.uuid().optional(),
    state: z.enum(["pending", "paid", "completed", "failed", "refunded"]).optional(),
    sort: z.enum(["created"]).default("created"),
    direction: z.enum(["asc", "desc"]).default("desc"),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(maxRows).default(maxRows),
  });
  const purchaseRow = z.object({
    id: z.uuid(),
    state: z.string(),
    amount_minor: z.string(),
    currency: z.string(),
    buyer: z.object({ id: z.uuid(), username: z.string(), email: z.string().nullable() }),
    listing: z.object({ id: z.uuid(), title: z.string() }),
    payment_reference: z.string().nullable(),
    provider: z.string().nullable(),
    provider_transaction_id: z.string().nullable(),
    checkout_id: z.uuid().nullable(),
    checkout_state: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    distribution: z
      .object({
        id: z.uuid(),
        amount_minor: z.string(),
        currency: z.string(),
        completed_at: z.string(),
      })
      .nullable(),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/purchases",
      tags: ["Finance"],
      summary: "List purchases",
      description:
        "Read-only cursor-paginated purchase facts. Optional buyer, listing and state filters narrow the result.",
      request: { query: purchaseQuery },
      responses: {
        200: {
          description: "Purchase collection",
          content: {
            "application/json": {
              schema: z.object({ items: z.array(purchaseRow), nextCursor: z.string().nullable() }),
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
          await container.operatorPurchases.list(p.accountId, c.req.valid("query")),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/purchases/{purchaseId}",
      tags: ["Finance"],
      summary: "Get purchase details",
      request: { params: z.object({ purchaseId: z.uuid() }) },
      responses: {
        200: {
          description: "Immutable purchase and distribution context",
          content: {
            "application/json": {
              schema: purchaseRow.extend({
                canonical_amount_minor: z.string(),
                canonical_currency: z.string(),
                listing_snapshot: z.object({
                  title: z.string(),
                  short_description: z.string(),
                  long_description: z.string(),
                }),
                payment: z.unknown().nullable(),
                checkout: z.unknown().nullable(),
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
        404: {
          description: "Purchase not found",
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
          await container.operatorPurchases.get(p.accountId, c.req.valid("param").purchaseId),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
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
    state: z.enum(["pending", "available", "reversed"]).optional(),
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
}
