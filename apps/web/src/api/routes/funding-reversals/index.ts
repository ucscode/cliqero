import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { hasCapability } from "@/modules/identity/capabilities";
import {
  requireCapabilityScope,
  requirePrincipal,
  requireScope,
  type Env,
} from "@/api/shared/context";
import { domainError } from "@/api/shared/error";
import { errorSchema } from "@/api/shared/schemas";

const item = z.object({
  id: z.uuid(),
  funding_id: z.uuid(),
  account_id: z.uuid(),
  amount_minor: z.string(),
  currency: z.literal("USD"),
  source: z.enum(["operator", "provider_event"]),
  reason: z.string(),
  provider_reference: z.string().nullable(),
  provider_event_id: z.uuid().nullable(),
  idempotency_key: z.string(),
  recovery: z.object({
    pending_credit_minor: z.string(),
    funding_wallet_minor: z.string(),
    earnings_wallet_minor: z.string(),
    debt_minor: z.string(),
  }),
  correlation_id: z.uuid(),
  created_by: z.uuid().nullable(),
  actor_system: z.string().nullable(),
  created_at: z.string(),
});
const body = z
  .object({
    funding_id: z.uuid(),
    amount_minor: z.string().regex(/^[1-9][0-9]{0,29}$/),
    reason: z.string().trim().min(1).max(1000),
    provider_reference: z.string().trim().max(200).optional(),
  })
  .strict();

export function registerFundingReversalRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/funding-reversals",
      tags: ["Funding Reversals"],
      summary: "List funding reversals",
      description:
        "Lists immutable provider funding reversal facts visible to the account or finance operators.",
      request: {
        query: z.object({
          account_id: z.uuid().optional(),
          funding_id: z.uuid().optional(),
          source: z.enum(["operator", "provider_event"]).optional(),
          cursor: z.string().max(512).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(20),
        }),
      },
      responses: {
        200: {
          description: "Funding reversal page",
          content: {
            "application/json": {
              schema: z.object({ items: z.array(item), next_cursor: z.string().nullable() }),
            },
          },
        },
        400: {
          description: "Invalid cursor",
          content: { "application/json": { schema: errorSchema } },
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
      const finance = hasCapability(p.capabilities as never, "finance.read");
      const denied = finance
        ? requireCapabilityScope(c, p, "finance.read", "payments:read")
        : requireScope(c, p, "wallet:read");
      if (denied) return denied;
      try {
        const q = c.req.valid("query");
        const page = await container.fundingReversals.list({
          accountId: finance ? q.account_id : p.accountId,
          fundingId: q.funding_id,
          source: q.source,
          cursor: q.cursor,
          limit: q.limit,
        });
        return c.json({ items: page.items.map(project), next_cursor: page.nextCursor }, 200);
      } catch (e) {
        return domainError(c, e);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/funding-reversals",
      tags: ["Funding Reversals"],
      summary: "Record a provider funding reversal",
      description:
        "Creates an immutable canonical-USD reversal and atomically allocates pending value, safe wallet recovery, and residual account debt. Replays with the same Idempotency-Key return the original fact.",
      request: {
        headers: z.object({ "idempotency-key": z.string().trim().min(1).max(200) }),
        body: { content: { "application/json": { schema: body } } },
      },
      responses: {
        201: {
          description: "Funding reversal created",
          content: { "application/json": { schema: item } },
        },
        400: {
          description: "Invalid reversal request",
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
        404: {
          description: "Funding transaction not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Funding state, provider origin, remaining amount, or idempotency conflict",
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
        const b = c.req.valid("json");
        return c.json(
          project(
            await container.fundingReversals.createByOperator({
              actorId: p.accountId,
              fundingId: b.funding_id,
              amountMinor: b.amount_minor,
              reason: b.reason,
              providerReference: b.provider_reference,
              idempotencyKey: c.req.header("idempotency-key")!,
            }),
          ),
          201,
        );
      } catch (e) {
        return domainError(c, e);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/funding-reversals/{reversalId}",
      tags: ["Funding Reversals"],
      summary: "Get a funding reversal",
      description: "Returns the immutable allocation and audit facts for a funding reversal.",
      request: { params: z.object({ reversalId: z.uuid() }) },
      responses: {
        200: { description: "Funding reversal", content: { "application/json": { schema: item } } },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Finance read permission required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Funding reversal not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      try {
        const reversal = await container.fundingReversals.get(c.req.valid("param").reversalId);
        if (!reversal) return c.json({ error: "Not found", code: "not_found" }, 404);
        if (hasCapability(p.capabilities as never, "finance.read")) {
          const denied = requireCapabilityScope(c, p, "finance.read", "payments:read");
          if (denied) return denied;
        } else if (reversal.accountId !== p.accountId) {
          return c.json({ error: "Forbidden", code: "forbidden" }, 403);
        } else {
          const denied = requireScope(c, p, "wallet:read");
          if (denied) return denied;
        }
        return c.json(project(reversal), 200);
      } catch (e) {
        return domainError(c, e);
      }
    },
  );
}

function project(v: Awaited<ReturnType<ApplicationContainer["fundingReversals"]["get"]>> & {}) {
  return {
    id: v.id,
    funding_id: v.fundingId,
    account_id: v.accountId,
    amount_minor: v.amountMinor,
    currency: v.currency,
    source: v.source,
    reason: v.reason,
    provider_reference: v.providerReference,
    provider_event_id: v.providerEventId,
    idempotency_key: v.idempotencyKey,
    recovery: {
      pending_credit_minor: v.recovery.pendingCreditMinor,
      funding_wallet_minor: v.recovery.fundingWalletMinor,
      earnings_wallet_minor: v.recovery.earningsWalletMinor,
      debt_minor: v.recovery.debtMinor,
    },
    correlation_id: v.correlationId,
    created_by: v.createdBy,
    actor_system: v.actorSystem,
    created_at: v.createdAt.toISOString(),
  };
}
