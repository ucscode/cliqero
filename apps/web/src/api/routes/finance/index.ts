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
      method: "delete",
      path: "/api/distributions/{distributionId}",
      request: { params: z.object({ distributionId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Distribution deleted by system root",
          content: {
            "application/json": {
              schema: z.object({ id: z.string().uuid(), deleted: z.boolean() }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "System root permission required",
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
      const denied = requireCapabilityScope(c, p, "system.root", "payments:manage");
      if (denied) return denied;
      try {
        return c.json(
          await container.operatorDistributions.deleteForRoot(
            p.accountId,
            c.req.valid("param").distributionId,
          ),
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
  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/earnings/entries/{entryId}",
      request: { params: z.object({ entryId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Earnings entry deleted by system root",
          content: {
            "application/json": {
              schema: z.object({ id: z.string().uuid(), deleted: z.boolean() }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "System root permission required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Earnings entry not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "system.root", "payments:manage");
      if (denied) return denied;
      try {
        return c.json(
          await container.operatorEarnings.deleteForRoot(p.accountId, c.req.valid("param").entryId),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
