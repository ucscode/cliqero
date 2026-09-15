import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../../shared/context";
import { domainError } from "../../../shared/error";
import { errorSchema } from "../../../shared/schemas";
import { jsonSafe } from "../../../shared/serialization";
import {
  operatorWithdrawalAttentionSchema,
  operatorWithdrawalDetailSchema,
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
      method: "post",
      path: "/api/operator/withdrawals/{withdrawalId}/approve",
      request: withdrawalParam,
      responses: {
        200: {
          description: "Withdrawal approved",
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
        return c.json(
          jsonSafe(
            await container.withdrawals.approve(p.accountId, c.req.valid("param").withdrawalId),
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
      method: "post",
      path: "/api/operator/withdrawals/{withdrawalId}/reject",
      request: {
        ...withdrawalParam,
        body: {
          content: {
            "application/json": {
              schema: z.object({ reason: z.string().min(3).max(500) }).strict(),
            },
          },
        },
      },
      responses: {
        200: {
          description: "Withdrawal rejected",
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
        return c.json(
          jsonSafe(
            await container.withdrawals.reject(
              p.accountId,
              c.req.valid("param").withdrawalId,
              c.req.valid("json").reason,
            ),
          ),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  for (const [path, operation] of [
    ["/api/operator/withdrawals/{withdrawalId}/payout", "payout"],
    ["/api/operator/withdrawals/{withdrawalId}/payout/reconcile", "reconcile"],
    ["/api/operator/withdrawals/{withdrawalId}/complete", "complete"],
  ] as const) {
    app.openapi(
      createRoute({
        method: "post",
        path,
        request: withdrawalParam,
        responses: {
          200: {
            description: "Withdrawal operation",
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
          const result =
            operation === "payout"
              ? await container.payoutExecution.execute(id, newId())
              : operation === "reconcile"
                ? await container.payoutExecution.reconcile(id, newId())
                : await container.payoutExecution.manualComplete(id, p.accountId, newId());
          return c.json(jsonSafe(result), 200);
        } catch (error) {
          return domainError(c, error);
        }
      },
    );
  }
}
