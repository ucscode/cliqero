import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../../shared/context";
import { domainError } from "../../../shared/error";
import { errorSchema } from "../../../shared/schemas";
import {
  operatorDistributionDetailSchema,
  operatorDistributionSummarySchema,
  operatorEarningsEntrySchema,
} from "./contracts";

export function registerOperatorFinanceRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  const operatorDistributionQuery = z.object({
    search: z.string().max(100).optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/distributions",
      request: { query: operatorDistributionQuery },
      responses: {
        200: {
          description: "Bounded operator distribution inspection",
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
          description: "Operator access required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "finance.read", "operations:manage");
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
      path: "/api/operator/distributions/{distributionId}",
      request: { params: z.object({ distributionId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Safe operator distribution detail",
          content: { "application/json": { schema: operatorDistributionDetailSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator access required",
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
      const denied = requireCapabilityScope(c, p, "finance.read", "operations:manage");
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
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/earnings",
      request: { query: operatorEarningsQuery },
      responses: {
        200: {
          description: "Bounded operator earnings ledger inspection",
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
          description: "Operator access required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "finance.read", "operations:manage");
      if (denied) return denied;
      try {
        return c.json(await container.operatorEarnings.list(c.req.valid("query")), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
