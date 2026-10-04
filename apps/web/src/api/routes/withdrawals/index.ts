import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import {
  requireCapabilityScope,
  requirePrincipal,
  requireScope,
  type Env,
} from "../../shared/context";
import { domainError } from "../../shared/error";
import { errorSchema } from "../../shared/schemas";
import { jsonSafe } from "../../shared/serialization";
import {
  operatorWithdrawalAttentionSchema,
  operatorWithdrawalCompleteSchema,
  operatorWithdrawalDetailSchema,
  operatorWithdrawalPatchSchema,
  operatorWithdrawalSchema,
  operatorWithdrawalStateSchema,
  withdrawalMutationResponseSchema,
} from "./contracts";
import { crudMaxRows } from "@/config/crud";
import { hasCapability } from "@/modules/identity/capabilities";
import { listOwnedWithdrawals } from "@/api/compat/withdrawals/route";
import { GET as getOwnedWithdrawal } from "@/api/compat/withdrawals/[id]/route";

export function registerWithdrawalRoutes(app: OpenAPIHono<Env>, container: ApplicationContainer) {
  const maxRows = crudMaxRows();
  const operatorWithdrawalQuery = z.object({
    search: z.string().max(100).optional(),
    state: operatorWithdrawalStateSchema.or(z.literal("all")).optional(),
    attention: operatorWithdrawalAttentionSchema.optional(),
    sort: z
      .enum(["created", "amount"])
      .default("created")
      .describe("Sort by created date or amount."),
    direction: z.enum(["asc", "desc"]).default("desc").describe("Sort direction."),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(maxRows).default(maxRows),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/withdrawals",
      request: { query: operatorWithdrawalQuery },
      responses: {
        200: {
          description: "Bounded withdrawal administration view",
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
          description: "Withdrawal management permission required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const query = c.req.valid("query");
      const requestsOperationalView = Boolean(
        query.state ||
        query.search ||
        query.attention ||
        c.req.query("sort") ||
        c.req.query("direction"),
      );
      if (!requestsOperationalView) {
        const denied = requireScope(c, p, "withdrawals:read");
        if (denied) return denied;
        return (await listOwnedWithdrawals(c.req.raw, p, container)) as never;
      }
      const denied = requireCapabilityScope(c, p, "withdrawals.manage", "withdrawals:manage");
      if (denied) return denied;
      try {
        return c.json(
          await container.operatorWithdrawals.list({
            ...query,
            state: query.state === "all" ? undefined : query.state,
          }),
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
      path: "/api/withdrawals/{withdrawalId}",
      request: { params: z.object({ withdrawalId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Safe withdrawal administration detail",
          content: { "application/json": { schema: operatorWithdrawalDetailSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Withdrawal management permission required",
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
      const canManage =
        hasCapability(p.capabilities, "withdrawals.manage") &&
        (p.kind === "user_session" || p.scopes.has("withdrawals:manage"));
      if (!canManage)
        return (await getOwnedWithdrawal(c.req.raw, {
          params: Promise.resolve({ withdrawalId: c.req.valid("param").withdrawalId }),
        })) as never;
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
      path: "/api/withdrawals/{withdrawalId}",
      request: {
        ...withdrawalParam,
        body: {
          content: {
            "application/json": {
              schema: operatorWithdrawalPatchSchema,
            },
          },
        },
      },
      responses: {
        200: {
          description: "Withdrawal state updated",
          content: { "application/json": { schema: withdrawalMutationResponseSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Withdrawal management permission required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const body = c.req.valid("json");
      const denied = requireCapabilityScope(c, p, "withdrawals.manage", "withdrawals:manage");
      if (denied) return denied;
      try {
        const id = c.req.valid("param").withdrawalId;
        const result = await container.withdrawals.update(p.accountId, id, {
          state: body.status,
          reason: body.status === "rejected" ? body.reason : undefined,
        });
        return c.json(withdrawalMutationResponseSchema.parse(jsonSafe(result)), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/withdrawals/{withdrawalId}/cancel",
      request: withdrawalParam,
      responses: {
        200: {
          description: "Withdrawal cancellation recorded and reservation released",
          content: { "application/json": { schema: withdrawalMutationResponseSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Withdrawal creation scope required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "withdrawals:create");
      if (denied) return denied;
      try {
        const result = await container.withdrawals.cancel(
          p.accountId,
          c.req.valid("param").withdrawalId,
        );
        return c.json(withdrawalMutationResponseSchema.parse(jsonSafe(result)), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/withdrawals/{withdrawalId}/complete",
      request: {
        ...withdrawalParam,
        body: {
          content: { "application/json": { schema: operatorWithdrawalCompleteSchema } },
        },
      },
      responses: {
        200: {
          description: "Approved withdrawal completion recorded",
          content: { "application/json": { schema: withdrawalMutationResponseSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Withdrawal management permission required",
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
        const body = c.req.valid("json");
        const result = await container.withdrawals.complete(
          p.accountId,
          c.req.valid("param").withdrawalId,
          {
            externalReference: body.external_reference,
            note: body.note,
          },
        );
        return c.json(withdrawalMutationResponseSchema.parse(jsonSafe(result)), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
