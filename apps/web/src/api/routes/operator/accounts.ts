import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../shared/context";
import { domainError } from "../../shared/error";
import { errorSchema } from "../../shared/schemas";
import { operatorAccountDetailSchema, operatorAccountSummarySchema } from "./accounts/contracts";

export function registerOperatorAccountRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  const accountListQuery = z.object({
    search: z.string().max(100).optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/accounts",
      request: { query: accountListQuery },
      responses: {
        200: {
          description: "Bounded operator account search",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(operatorAccountSummarySchema),
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
      const denied = requireCapabilityScope(c, p, "accounts.read", "operations:manage");
      if (denied) return denied;
      try {
        return c.json(await container.operatorAccounts.list(c.req.valid("query")), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/accounts/{accountId}",
      request: { params: z.object({ accountId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Safe operator account projection",
          content: { "application/json": { schema: operatorAccountDetailSchema } },
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
          description: "Account not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "accounts.read", "operations:manage");
      if (denied) return denied;
      try {
        return c.json(await container.operatorAccounts.get(c.req.valid("param").accountId), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
