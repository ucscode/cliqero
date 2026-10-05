import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../shared/context";
import { domainError } from "../../shared/error";
import { errorSchema } from "../../shared/schemas";
import { jsonSafe } from "../../shared/serialization";
import { operatorTreasuryEntrySchema, operatorTreasurySummarySchema } from "./contracts";
import { crudMaxRows } from "@/config/crud";

export function registerTreasuryRoutes(app: OpenAPIHono<Env>, container: ApplicationContainer) {
  const maxRows = crudMaxRows();
  const treasuryEntryQuery = z.object({
    search: z.string().max(100).optional(),
    direction: z.enum(["credit", "debit"]).optional(),
    source: z.enum(["automatic", "adjustment"]).optional(),
    sort: z
      .enum(["created", "amount"])
      .default("created")
      .describe("Sort by creation date or entry amount."),
    sort_direction: z.enum(["asc", "desc"]).default("desc").describe("Sort direction."),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(maxRows).default(maxRows),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/treasury",
      responses: {
        200: {
          description: "Operator treasury summary",
          content: { "application/json": { schema: operatorTreasurySummarySchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Treasury management permission required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "treasury.manage", "treasury:read");
      if (denied) return denied;
      try {
        return c.json(await container.operatorTreasury.summary(), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/treasury/entries",
      request: { query: treasuryEntryQuery },
      responses: {
        200: {
          description: "Bounded treasury administration entries",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(operatorTreasuryEntrySchema),
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
          description: "Treasury management permission required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "treasury.manage", "treasury:read");
      if (denied) return denied;
      try {
        return c.json(await container.operatorTreasury.list(c.req.valid("query")), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/treasury/entries/{entryId}",
      request: { params: z.object({ entryId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Treasury entry detail",
          content: { "application/json": { schema: operatorTreasuryEntrySchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Treasury management permission required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Treasury entry not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "treasury.manage", "treasury:read");
      if (denied) return denied;
      try {
        return c.json(await container.operatorTreasury.get(c.req.valid("param").entryId), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  const treasuryAdjustmentBody = z
    .object({
      amount_minor: z
        .string()
        .regex(/^-?[1-9]\d*$/)
        .max(18),
      reason: z.string().trim().min(1).max(1000),
      reference: z.string().trim().max(200).optional(),
    })
    .strict();
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/treasury/adjustments",
      request: {
        headers: z.object({ "idempotency-key": z.string().trim().min(1).max(200) }),
        body: { content: { "application/json": { schema: treasuryAdjustmentBody } } },
      },
      responses: {
        201: {
          description: "Signed Treasury adjustment and deterministic ledger entry created",
          content: { "application/json": { schema: operatorTreasuryEntrySchema } },
        },
        400: {
          description: "Invalid treasury entry",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Treasury management permission required",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Idempotency conflict",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "treasury.manage", "treasury:manage");
      if (denied) return denied;
      try {
        const body = c.req.valid("json");
        const entry = await container.treasury.createAdjustment({
          amountMinor: BigInt(body.amount_minor),
          reason: body.reason,
          reference: body.reference,
          actorId: p.accountId,
          idempotencyKey:
            c.req.header("Idempotency-Key") ??
            (() => {
              throw new Error("A valid Idempotency-Key is required");
            })(),
        });
        return c.json(
          jsonSafe({
            id: entry.id,
            direction: entry.direction,
            amountMinor: entry.amountMinor.toString(),
            title: entry.title,
            note: entry.note,
            source:
              entry.sourceKind && entry.sourceId
                ? { kind: entry.sourceKind, id: entry.sourceId }
                : null,
            actor: { id: p.accountId, username: p.account.username, email: null },
            createdAt: entry.createdAt.toISOString(),
          }),
          201,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
