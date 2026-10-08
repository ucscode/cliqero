import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { crudMaxRows } from "@/config/crud";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../shared/context";
import { domainError } from "../../shared/error";
import { errorSchema } from "../../shared/schemas";

const correctionSchema = z
  .object({
    id: z.uuid().openapi({ example: "5f3f11aa-5eec-4f25-a5d3-d5a83fc91d91" }),
    accountId: z.uuid(),
    accountUsername: z.string(),
    sourceEntryId: z.uuid().openapi({ example: "983df5b7-fc27-4d5b-b808-42db75ed7625" }),
    purchaseId: z.uuid(),
    distributionId: z.uuid(),
    amountMinor: z
      .string()
      .regex(/^[1-9]\d*$/)
      .openapi({ example: "2500" }),
    pendingMinor: z.string().regex(/^\d+$/).openapi({ example: "0" }),
    availableMinor: z.string().regex(/^\d+$/).openapi({ example: "1800" }),
    debtMinor: z.string().regex(/^\d+$/).openapi({ example: "700" }),
    reason: z.string().openapi({ example: "Correct referral allocation after review" }),
    createdBy: z.uuid().openapi({ example: "e13eebc1-562a-4bc5-9518-f25b0cfa06ca" }),
    createdByUsername: z.string().openapi({ example: "finance_operator" }),
    correlationId: z.uuid().openapi({ example: "5f3f11aa-5eec-4f25-a5d3-d5a83fc91d91" }),
    idempotencyKey: z.string().openapi({ example: "earning-correction-2026-001" }),
    createdAt: z.string().datetime().openapi({ example: "2026-10-08T12:30:00.000Z" }),
  })
  .openapi({
    example: {
      id: "5f3f11aa-5eec-4f25-a5d3-d5a83fc91d91",
      accountId: "a83a07cc-3f3c-4e26-9c63-a4780069087a",
      accountUsername: "seller_one",
      sourceEntryId: "983df5b7-fc27-4d5b-b808-42db75ed7625",
      purchaseId: "8f1a0e23-43c1-4c6e-b892-80174c5ca10d",
      distributionId: "69a7bf47-58b6-4a63-8c40-7948d9758910",
      amountMinor: "2500",
      pendingMinor: "0",
      availableMinor: "1800",
      debtMinor: "700",
      reason: "Correct referral allocation after review",
      createdBy: "e13eebc1-562a-4bc5-9518-f25b0cfa06ca",
      createdByUsername: "finance_operator",
      correlationId: "5f3f11aa-5eec-4f25-a5d3-d5a83fc91d91",
      idempotencyKey: "earning-correction-2026-001",
      createdAt: "2026-10-08T12:30:00.000Z",
    },
  });

export function registerEarningsCorrectionRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  const maxRows = crudMaxRows();
  const listQuery = z.object({
    source_entry_id: z.uuid().optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(maxRows).default(maxRows),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/earnings/corrections",
      tags: ["Earnings Corrections"],
      summary: "List source-linked Earnings corrections",
      description:
        "Lists immutable corrections against original purchase-earning entries. Each fact records pending value offset, unreserved Earnings recovered, and any residual account debt.",
      request: { query: listQuery },
      responses: {
        200: {
          description: "Earnings corrections",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(correctionSchema),
                nextCursor: z.string().nullable(),
              }),
              example: {
                items: [],
                nextCursor: null,
              },
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
        return c.json(
          await container.earningsCorrections.list(principal.accountId, {
            sourceEntryId: c.req.valid("query").source_entry_id,
            cursor: c.req.valid("query").cursor,
            limit: c.req.valid("query").limit,
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
      path: "/api/earnings/corrections/{correctionId}",
      tags: ["Earnings Corrections"],
      summary: "Get an Earnings correction",
      description: "Returns an immutable source-linked Earnings recovery fact.",
      request: { params: z.object({ correctionId: z.uuid() }) },
      responses: {
        200: {
          description: "Earnings correction",
          content: { "application/json": { schema: correctionSchema } },
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
          description: "Earnings correction not found",
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
          await container.earningsCorrections.get(
            principal.accountId,
            c.req.valid("param").correctionId,
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
      path: "/api/earnings/corrections",
      tags: ["Earnings Corrections"],
      summary: "Correct a purchase-earning source",
      description:
        "Records an immutable partial or full recovery against one positive purchase-earning source. Pending value is offset first, then only unreserved available Earnings; any remainder becomes Earnings debt. The source account is resolved server-side. Retries require the same Idempotency-Key and intent.",
      request: {
        headers: z.object({ "idempotency-key": z.string().trim().min(1).max(200) }),
        body: {
          content: {
            "application/json": {
              schema: z
                .object({
                  source_entry_id: z
                    .uuid()
                    .openapi({ example: "983df5b7-fc27-4d5b-b808-42db75ed7625" }),
                  amount_minor: z
                    .string()
                    .regex(/^[1-9]\d{0,18}$/)
                    .max(19),
                  reason: z
                    .string()
                    .trim()
                    .min(1)
                    .max(1000)
                    .openapi({ example: "Correct referral allocation after review" }),
                })
                .strict()
                .openapi({
                  example: {
                    source_entry_id: "983df5b7-fc27-4d5b-b808-42db75ed7625",
                    amount_minor: "2500",
                    reason: "Correct referral allocation after review",
                  },
                }),
            },
          },
        },
      },
      responses: {
        200: {
          description: "Previously created correction returned for an idempotent retry",
          content: { "application/json": { schema: correctionSchema } },
        },
        201: {
          description: "Earnings correction recorded",
          content: { "application/json": { schema: correctionSchema } },
        },
        400: {
          description: "Invalid correction request",
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
          description: "Correctable source not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description:
            "Source was reversed, correction exceeds remaining value, or idempotency conflicts",
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
        const body = c.req.valid("json");
        const result = await container.earningsCorrections.create(principal.accountId, {
          sourceEntryId: body.source_entry_id,
          amountMinor: body.amount_minor,
          reason: body.reason,
          idempotencyKey: c.req.header("Idempotency-Key")!,
        });
        return c.json(result.correction, result.created ? 201 : 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
