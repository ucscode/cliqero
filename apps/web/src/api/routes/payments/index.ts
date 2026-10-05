import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";
import { newId } from "@/kernel/ids";
import type { ApplicationContainer } from "@/infrastructure/container";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../shared/context";
import { domainError } from "../../shared/error";
import { errorSchema, opaqueJsonSchema } from "../../shared/schemas";

const providerSchema = z.string().regex(/^[a-z0-9_-]{1,50}$/);
const nullableStringOrNumberSchema = z
  .union([z.string(), z.number()])
  .nullable()
  .openapi({
    anyOf: [
      { type: "string", nullable: true },
      { type: "number", nullable: true },
    ],
  });
const paymentListQuery = z.object({
  provider: providerSchema.optional(),
  state: z.string().max(40).optional(),
  search: z.string().max(100).optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const paymentSummarySchema = z.object({
  id: z.uuid(),
  provider: z.string(),
  reference: z.string(),
  provider_transaction_id: z.string().nullable(),
  state: z.string(),
  amount_minor: z.string(),
  currency: z.string(),
  canonical_amount_minor: z.string(),
  canonical_currency: z.string(),
  buyer_username: z.string(),
  listing: z.object({ id: z.string(), title: z.string() }),
  created_at: z.string(),
});
const reconciliationCandidateSchema = z.object({
  id: z.uuid(),
  provider: z.string(),
  reference: z.string(),
  provider_transaction_id: z.string().nullable(),
  state: z.string(),
  amount_minor: z.string(),
  currency: z.string(),
  canonical_amount_minor: z.string(),
  canonical_currency: z.string(),
  buyer_id: z.string(),
  listing_id: z.string(),
});
const providerEventSchema = z.object({
  id: z.union([z.string(), z.number()]),
  provider: z.string(),
  event_type: z.string(),
  provider_reference: z.string().nullable(),
  amount_minor: nullableStringOrNumberSchema,
  currency: z.string().nullable(),
  state: z.string(),
  last_error: z.string().nullable(),
  received_at: z.string(),
  processed_at: z.string().nullable(),
  payment_id: z.uuid().nullable(),
  payment_state: z.string().nullable(),
  provider_transaction_id: z.string().nullable(),
  outbox_state: z.string().nullable(),
  outbox_last_error: z.string().nullable(),
});
const reconciliationAttemptSchema = z.object({
  id: z.string(),
  paymentId: z.string(),
  idempotencyKey: z.string(),
  state: z.enum(["started", "completed", "skipped", "mismatch", "failed"]),
  result: opaqueJsonSchema,
  lastError: z.string().nullable(),
  actorId: z.string(),
  correlationId: z.string(),
});

export function registerPaymentRoutes(app: OpenAPIHono<Env>, container: ApplicationContainer) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/payments",
      tags: ["Payments"],
      summary: "List payments",
      description:
        "Search persisted Cliqero payment records. The provider is an optional filter, not a resource namespace.",
      request: { query: paymentListQuery },
      responses: {
        200: {
          description: "Cursor-paginated payment records",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(paymentSummarySchema),
                nextCursor: z.string().nullable(),
              }),
            },
          },
        },
        400: {
          description: "Invalid payment filters or pagination cursor",
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
      const principal = requirePrincipal(c);
      if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
      const denied = requireCapabilityScope(c, principal, "finance.read", "payments:read");
      if (denied) return denied;
      try {
        return c.json(
          await container.operatorPayments.list(principal.accountId, c.req.valid("query")),
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
      path: "/api/payments/{paymentId}",
      tags: ["Payments"],
      summary: "Get payment details",
      description:
        "Returns a safe persisted payment projection, omitting provider authorization and raw response payloads.",
      request: { params: z.object({ paymentId: z.uuid() }) },
      responses: {
        200: {
          description: "Payment details",
          content: {
            "application/json": {
              schema: paymentSummarySchema.extend({
                updated_at: z.string(),
                fee_minor: z.string().nullable(),
                fee_currency: z.string().nullable(),
                conversion_snapshot: opaqueJsonSchema,
              }),
            },
          },
        },
        400: {
          description: "Invalid payment ID",
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
        404: {
          description: "Payment not found",
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
        return c.json(
          await container.operatorPayments.get(principal.accountId, c.req.valid("param").paymentId),
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
      path: "/api/payments/events",
      tags: ["Payments"],
      summary: "List provider events",
      description:
        "Inspect persisted ingress events across providers; provider may be supplied as a filter.",
      request: {
        query: z.object({
          provider: providerSchema.optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        }),
      },
      responses: {
        200: {
          description: "Persisted provider events",
          content: {
            "application/json": { schema: z.object({ events: z.array(providerEventSchema) }) },
          },
        },
        400: {
          description: "Invalid provider filter or limit",
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
      const principal = requirePrincipal(c);
      if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
      const denied = requireCapabilityScope(c, principal, "finance.read", "payments:read");
      if (denied) return denied;
      try {
        return c.json(
          {
            events: await container.operatorPayments.events(
              principal.accountId,
              c.req.valid("query"),
            ),
          },
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
      path: "/api/payments/reconcile",
      tags: ["Payments"],
      summary: "List reconciliation candidates",
      description:
        "Lists unresolved payments older than the requested age, optionally filtered by provider.",
      request: {
        query: z.object({
          provider: providerSchema.optional(),
          older_than_minutes: z.coerce.number().int().min(1).max(10080).default(15),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        }),
      },
      responses: {
        200: {
          description: "Payments eligible for reconciliation",
          content: {
            "application/json": {
              schema: z.object({ payments: z.array(reconciliationCandidateSchema) }),
            },
          },
        },
        400: {
          description: "Invalid reconciliation filters",
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
      },
    }),
    async (c) => {
      const principal = requirePrincipal(c);
      if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
      const denied = requireCapabilityScope(c, principal, "finance.manage", "payments:manage");
      if (denied) return denied;
      try {
        const query = c.req.valid("query");
        const payments = await container.paymentReconciliation.eligible({
          actorId: principal.accountId,
          provider: query.provider,
          olderThanMinutes: query.older_than_minutes,
          limit: query.limit,
        });
        return c.json(
          {
            payments: payments.map((payment) => ({
              id: payment.id,
              provider: payment.providerName,
              reference: payment.providerReference,
              provider_transaction_id: payment.providerTransactionId ?? null,
              state: payment.state,
              amount_minor: (payment.collectionAmount ?? payment.amount).minorAmount.toString(),
              currency: (payment.collectionAmount ?? payment.amount).currency,
              canonical_amount_minor: payment.canonicalAmount.minorAmount.toString(),
              canonical_currency: payment.canonicalAmount.currency,
              buyer_id: payment.buyerId,
              listing_id: payment.listingId,
            })),
          },
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
      path: "/api/payments/{paymentId}/reconcile",
      tags: ["Payments"],
      summary: "Reconcile a payment",
      description:
        "Schedules verification using the provider recorded on the payment; clients do not select a provider-specific operation.",
      request: {
        params: z.object({ paymentId: z.uuid() }),
        headers: z.object({ "idempotency-key": z.string().min(1).max(200) }),
      },
      responses: {
        200: {
          description: "Idempotent reconciliation result",
          content: {
            "application/json": { schema: z.object({ attempt: reconciliationAttemptSchema }) },
          },
        },
        400: {
          description: "Invalid payment ID or idempotency key",
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
          description: "Payment not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const principal = requirePrincipal(c);
      if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
      const denied = requireCapabilityScope(c, principal, "finance.manage", "payments:manage");
      if (denied) return denied;
      try {
        const { paymentId } = c.req.valid("param");
        return c.json(
          {
            attempt: await container.paymentReconciliation.reconcile({
              actorId: principal.accountId,
              paymentId,
              idempotencyKey: c.req.header("idempotency-key")!,
              correlationId: newId(),
            }),
          },
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
      path: "/api/payments/events/{eventId}/reprocess",
      tags: ["Payments"],
      summary: "Reprocess a rejected provider event",
      description:
        "Queues the immutable Paystack event evidence through its existing worker handler. Reprocessing does not edit provider payloads and is safe to retry with the same idempotency key.",
      request: {
        params: z.object({ eventId: z.uuid() }),
        headers: z.object({
          "idempotency-key": z
            .string()
            .min(1)
            .max(200)
            .openapi({ example: "repair-event-2026-001" }),
        }),
      },
      responses: {
        200: {
          description: "Idempotent event reprocessing result",
          content: {
            "application/json": {
              schema: z
                .object({
                  event_id: z.uuid().openapi({ example: "8f1fd548-3cc9-4c15-8cf9-31c46e4d3488" }),
                  state: z.enum(["queued", "already_processed"]).openapi({ example: "queued" }),
                  applied: z.boolean().openapi({ example: true }),
                  correlation_id: z
                    .uuid()
                    .openapi({ example: "27ddf1f8-0a69-4a56-a755-8d7b3f966a79" }),
                })
                .openapi({
                  example: {
                    event_id: "8f1fd548-3cc9-4c15-8cf9-31c46e4d3488",
                    state: "queued",
                    applied: true,
                    correlation_id: "27ddf1f8-0a69-4a56-a755-8d7b3f966a79",
                  },
                }),
            },
          },
        },
        400: {
          description: "Invalid event ID or idempotency key",
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
          description: "Provider event not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Provider event cannot be reprocessed or key conflicts",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const principal = requirePrincipal(c);
      if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
      const denied = requireCapabilityScope(c, principal, "finance.manage", "payments:manage");
      if (denied) return denied;
      try {
        const result = await container.providerEventReprocessing.reprocess({
          actorId: principal.accountId,
          eventId: c.req.valid("param").eventId,
          idempotencyKey: c.req.header("idempotency-key")!,
        });
        return c.json(
          {
            event_id: result.eventId,
            state: result.state,
            applied: result.applied,
            correlation_id: result.correlationId,
          },
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
