import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../../shared/context";
import { domainError } from "../../../shared/error";
import { errorSchema } from "../../../shared/schemas";
import { jsonSafe } from "../../../shared/serialization";
import {
  operatorWithdrawalAttentionSchema,
  operatorWithdrawalDetailSchema,
  operatorWithdrawalPatchSchema,
  operatorWithdrawalSchema,
  operatorWithdrawalStateSchema,
} from "./contracts";

export function registerOperatorWithdrawalRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  const operatorWithdrawalQuery = z.object({
    search: z.string().max(100).optional(),
    state: operatorWithdrawalStateSchema.optional(),
    attention: operatorWithdrawalAttentionSchema.optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/withdrawals",
      request: { query: operatorWithdrawalQuery },
      responses: {
        200: {
          description: "Bounded operator withdrawal inspection",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(operatorWithdrawalSchema),
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
      const denied = requireCapabilityScope(c, p, "withdrawals.manage", "withdrawals:manage");
      if (denied) return denied;
      try {
        return c.json(await container.operatorWithdrawals.list(c.req.valid("query")), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/withdrawals/{withdrawalId}",
      request: { params: z.object({ withdrawalId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Safe operator withdrawal detail",
          content: { "application/json": { schema: operatorWithdrawalDetailSchema } },
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
          description: "Withdrawal not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "withdrawals.manage", "withdrawals:manage");
      if (denied) return denied;
      try {
        return c.json(
          await container.operatorWithdrawals.get(c.req.valid("param").withdrawalId),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  const withdrawalParam = { params: z.object({ withdrawalId: z.string().uuid() }) };
  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/operator/withdrawals/{withdrawalId}",
      request: {
        ...withdrawalParam,
        body: {
          content: { "application/json": { schema: operatorWithdrawalPatchSchema } },
        },
      },
      responses: {
        200: {
          description: "Withdrawal state updated",
          content: { "application/json": { schema: z.any() } },
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
      const denied = requireCapabilityScope(c, p, "withdrawals.manage", "withdrawals:manage");
      if (denied) return denied;
      try {
        const id = c.req.valid("param").withdrawalId;
        const body = c.req.valid("json");
        const result =
          body.status === "approved"
            ? await container.withdrawals.approve(p.accountId, id)
            : body.status === "rejected"
              ? await container.withdrawals.reject(p.accountId, id, body.reason)
              : await container.withdrawals.complete(p.accountId, id, {
                  externalReference: body.external_reference,
                  note: body.note,
                });
        return c.json(jsonSafe(result), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
