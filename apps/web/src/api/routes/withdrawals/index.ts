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
  operatorWithdrawalPatchSchema,
  operatorPayoutReturnRequestSchema,
  operatorPayoutReturnResponseSchema,
  withdrawalCollectionSchema,
  withdrawalResourceSchema,
  operatorWithdrawalStateSchema,
  withdrawalMutationResponseSchema,
} from "./contracts";
import { crudMaxRows } from "@/config/crud";
import { hasCapability } from "@/modules/identity/capabilities";
import { listOwnedWithdrawals } from "@/api/compat/withdrawals/route";
import {
  presentOperatorWithdrawal,
  presentOwnedWithdrawal,
} from "@/api/compat/withdrawals/presentation";

export function registerWithdrawalRoutes(app: OpenAPIHono<Env>, container: ApplicationContainer) {
  const maxRows = crudMaxRows();
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/withdrawals/policy",
      tags: ["Withdrawal Policy"],
      summary: "Get the active withdrawal policy",
      description: "Returns current withdrawal limits and the customer-safe fee settings.",
      responses: {
        200: {
          description: "Active withdrawal policy",
          content: {
            "application/json": {
              schema: z.object({
                enabled: z.boolean(),
                minimum_amount_minor: z.string(),
                maximum_amount_minor: z.string().nullable(),
                currency: z.string(),
                fee_enabled: z.boolean(),
                fee_basis_points: z.string(),
                fee_maximum_amount_minor: z.string().nullable(),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Withdrawal read permission required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const principal = requirePrincipal(c);
      if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
      const denied = requireScope(c, principal, "withdrawals:read");
      if (denied) return denied;
      try {
        const [policy, fees] = await Promise.all([
          container.withdrawalPolicy.getActive(),
          container.feePolicy.getActive(),
        ]);
        const fee = fees.withdrawal;
        return c.json(
          {
            enabled: policy.enabled,
            minimum_amount_minor: policy.minimumAmount.minorAmount.toString(),
            maximum_amount_minor: policy.maximumAmount?.minorAmount.toString() ?? null,
            currency: policy.minimumAmount.currency,
            fee_enabled: fees.enabled && fee.enabled,
            fee_basis_points: fee.basisPoints.toString(),
            fee_maximum_amount_minor: fee.maximumMinor?.toString() ?? null,
          },
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  const operatorWithdrawalQuery = z.object({
    search: z
      .string()
      .max(100)
      .optional()
      .describe("Operator-only filter; requires withdrawals.manage capability and scope."),
    state: operatorWithdrawalStateSchema
      .or(z.literal("all"))
      .optional()
      .describe("Operator-only state filter; requires withdrawals.manage capability and scope."),
    attention: operatorWithdrawalAttentionSchema
      .optional()
      .describe(
        "Operator-only attention filter; requires withdrawals.manage capability and scope.",
      ),
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
          description:
            "Requires withdrawals:read for API keys and lists only the authenticated account's withdrawals by default. Broader records and operational filters additionally require the withdrawals.manage capability and, for API keys, the withdrawals:manage scope.",
          content: {
            "application/json": {
              schema: withdrawalCollectionSchema,
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Withdrawal read permission or manager capability/scope required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const readDenied = requireScope(c, p, "withdrawals:read");
      if (readDenied) return readDenied;
      const query = c.req.valid("query");
      const requestsOperationalView = Boolean(
        query.state ||
        query.search ||
        query.attention ||
        c.req.query("sort") ||
        c.req.query("direction"),
      );
      const canManage =
        hasCapability(p.capabilities, "withdrawals.manage") &&
        (p.kind === "user_session" || p.scopes.has("withdrawals:manage"));
      if (!canManage) {
        if (requestsOperationalView) return c.json({ error: "Forbidden", code: "forbidden" }, 403);
        return (await listOwnedWithdrawals(c.req.raw, p, container)) as never;
      }
      const denied = requireCapabilityScope(c, p, "withdrawals.manage", "withdrawals:manage");
      if (denied) return denied;
      try {
        const page = await container.operatorWithdrawals.list({
          ...query,
          state: query.state === "all" ? undefined : query.state,
        });
        return c.json(
          withdrawalCollectionSchema.parse({
            items: page.items.map(presentOperatorWithdrawal),
            next_cursor: page.nextCursor,
            wallet_summary: null,
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
          description:
            "Requires withdrawals:read for API keys. Returns only the authenticated account's withdrawal unless the principal also has the withdrawals.manage capability and, for API keys, the withdrawals:manage scope. Sensitive payout fields are only included for authorized managers.",
          content: { "application/json": { schema: withdrawalResourceSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Withdrawal read permission or manager capability/scope required",
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
      const readDenied = requireScope(c, p, "withdrawals:read");
      if (readDenied) return readDenied;
      const canManage =
        hasCapability(p.capabilities, "withdrawals.manage") &&
        (p.kind === "user_session" || p.scopes.has("withdrawals:manage"));
      if (!canManage) {
        try {
          const record = await container.withdrawals.get(
            p.accountId,
            c.req.valid("param").withdrawalId,
          );
          return c.json(withdrawalResourceSchema.parse(presentOwnedWithdrawal(record)), 200);
        } catch (error) {
          return domainError(c, error);
        }
      }
      const denied = requireCapabilityScope(c, p, "withdrawals.manage", "withdrawals:manage");
      if (denied) return denied;
      try {
        return c.json(
          withdrawalResourceSchema.parse(
            presentOperatorWithdrawal(
              await container.operatorWithdrawals.get(c.req.valid("param").withdrawalId),
            ),
          ),
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
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/withdrawals/{withdrawalId}/payout-return",
      tags: ["Withdrawals"],
      summary: "Record a returned payout",
      description:
        "Records immutable evidence that a completed payout returned to Cliqero. The gross reservation is restored, outstanding account debt is settled first, and the original payout history remains unchanged.",
      request: {
        params: z.object({ withdrawalId: z.string().uuid() }),
        headers: z.object({ "idempotency-key": z.string().min(1).max(200) }),
        body: {
          content: {
            "application/json": {
              schema: operatorPayoutReturnRequestSchema,
              examples: {
                returned: {
                  summary: "Returned bank payout",
                  value: {
                    amount_minor: "4750",
                    reason: "Receiving bank returned the payout",
                    external_reference: "BANK-RETURN-2048",
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description:
            "Returned payout recorded and gross value restored through the earnings ledger",
          content: {
            "application/json": {
              schema: operatorPayoutReturnResponseSchema,
              examples: {
                restored: {
                  summary: "Payout return recorded",
                  value: {
                    payoutReturn: {
                      id: "8e48b675-f3fc-4dc9-a143-ffcc2e9b5a1e",
                      withdrawalId: "1d21c4d2-a19b-40d4-978d-f4834906a5ed",
                      amountMinor: "4750",
                      restoredMinor: "5000",
                      reason: "Receiving bank returned the payout",
                      externalReference: "BANK-RETURN-2048",
                      actorId: "fc1c4616-29cb-4bdb-bf12-ff86d5e740ab",
                      correlationId: "a11bff5a-636f-42c5-8cf0-6bc0789d7475",
                      idempotencyKey: "payout-return-2048",
                    },
                    changed: true,
                  },
                },
              },
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
        404: {
          description: "Withdrawal not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description:
            "Withdrawal is not completed, amount does not match, or idempotency conflicts",
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
        const result = await container.withdrawals.recordPayoutReturn(
          p.accountId,
          c.req.valid("param").withdrawalId,
          {
            amountMinor: body.amount_minor,
            reason: body.reason,
            externalReference: body.external_reference,
            idempotencyKey: c.req.valid("header")["idempotency-key"],
          },
        );
        return c.json(operatorPayoutReturnResponseSchema.parse(jsonSafe(result)), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
