import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../shared/context";
import { domainError } from "../../shared/error";
import { errorSchema } from "../../shared/schemas";
import { jsonSafe } from "../../shared/serialization";

const accountParams = z.object({ accountId: z.string().uuid() });
const debtEntrySchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["increase", "settlement", "write_off"]),
  amountMinor: z.string().regex(/^\d+$/),
  wallet: z.enum(["funding", "earnings", "account"]),
  source: z.object({ kind: z.string(), id: z.string() }),
  reason: z.string(),
  actor: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("account"), id: z.string().uuid() }),
    z.object({ kind: z.literal("system"), id: z.string() }),
  ]),
  correlationId: z.string().uuid(),
  idempotencyKey: z.string(),
  createdAt: z.string().datetime(),
});

export function registerAccountDebtRoutes(app: OpenAPIHono<Env>, container: ApplicationContainer) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/accounts/{accountId}/debt",
      tags: ["Account Debt"],
      summary: "Inspect account debt",
      description: "Returns the derived outstanding USD receivable and its append-only history.",
      request: {
        params: accountParams,
        query: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(50),
          before: z.string().regex(/^\d+$/).optional(),
        }),
      },
      responses: {
        200: {
          description: "Current account debt and history",
          content: {
            "application/json": {
              schema: z.object({
                accountId: z.string().uuid(),
                outstandingMinor: z.string(),
                entries: z.array(debtEntrySchema),
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
      const principal = requirePrincipal(c);
      if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
      const denied = requireCapabilityScope(c, principal, "finance.read", "payments:read");
      if (denied) return denied;
      try {
        const { accountId } = c.req.valid("param");
        const { limit, before } = c.req.valid("query");
        const [outstandingMinor, entries] = await Promise.all([
          container.accountDebt.balance(principal.accountId, accountId),
          container.accountDebt.history(principal.accountId, accountId, limit, before),
        ]);
        return c.json(jsonSafe({ accountId, outstandingMinor, entries }), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/accounts/{accountId}/debt/write-offs",
      tags: ["Account Debt"],
      summary: "Write off account debt",
      description:
        "Records a privileged, idempotent write-off; the original debt history is retained.",
      request: {
        params: accountParams,
        headers: z.object({ "idempotency-key": z.string().trim().min(1).max(200) }),
        body: {
          content: {
            "application/json": {
              schema: z
                .object({
                  amount_minor: z
                    .string()
                    .regex(/^[1-9]\d*$/)
                    .max(18),
                  source_kind: z.string().trim().min(1).max(100),
                  source_id: z.string().trim().min(1).max(200),
                  reason: z.string().trim().min(1).max(1000),
                  correlation_id: z.string().uuid(),
                })
                .strict(),
            },
          },
        },
      },
      responses: {
        201: {
          description: "Debt write-off recorded",
          content: {
            "application/json": {
              schema: z.object({
                changed: z.boolean(),
                entry: debtEntrySchema.nullable(),
                outstandingMinor: z.string(),
              }),
            },
          },
        },
        400: {
          description: "Invalid write-off",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "System root required",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Write-off exceeds debt or idempotency conflict",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const principal = requirePrincipal(c);
      if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
      const denied = requireCapabilityScope(c, principal, "system.root", "payments:manage");
      if (denied) return denied;
      try {
        const { accountId } = c.req.valid("param");
        const body = c.req.valid("json");
        const result = await container.accountDebt.writeOff(principal.accountId, {
          accountId,
          amountMinor: BigInt(body.amount_minor),
          sourceKind: body.source_kind,
          sourceId: body.source_id,
          reason: body.reason,
          correlationId: body.correlation_id,
          idempotencyKey: c.req.header("Idempotency-Key")!,
        });
        const outstandingMinor = await container.accountDebt.balance(
          principal.accountId,
          accountId,
        );
        return c.json(
          jsonSafe({ changed: result.changed, entry: result.entry, outstandingMinor }),
          201,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
