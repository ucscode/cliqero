import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import * as routeContracts from "../contracts";
import type { Env } from "../contracts";

export function registerOperatorTreasuryRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  const {
    errorSchema,
    operatorTreasuryEntrySchema,
    operatorTreasurySummarySchema,
    requirePrincipal,
    requireCapabilityScope,
    domainError,
    jsonSafe,
  } = routeContracts;

  const treasuryEntryQuery = z.object({
    search: z.string().max(100).optional(),
    direction: z.enum(["credit", "debit"]).optional(),
    source: z.enum(["automatic", "manual"]).optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/treasury",
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
          description: "Operator access required",
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
      path: "/api/operator/treasury/entries",
      request: { query: treasuryEntryQuery },
      responses: {
        200: {
          description: "Bounded operator treasury entries",
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
          description: "Operator access required",
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
      path: "/api/operator/treasury/entries/{entryId}",
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
          description: "Operator access required",
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
  const treasuryEntryBody = z
    .object({
      direction: z.enum(["credit", "debit"]),
      amount_minor: z
        .string()
        .regex(/^[1-9]\d*$/)
        .max(18),
      title: z.string().trim().min(1).max(200),
      note: z.string().trim().max(1000).optional(),
    })
    .strict();
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/treasury/entries",
      request: {
        headers: z.object({ "idempotency-key": z.string().trim().min(1).max(200) }),
        body: { content: { "application/json": { schema: treasuryEntryBody } } },
      },
      responses: {
        201: {
          description: "Treasury entry created",
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
          description: "Operator access required",
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
        const entry = await container.treasury.createManual({
          direction: body.direction,
          amountMinor: BigInt(body.amount_minor),
          title: body.title,
          note: body.note,
          actorId: p.accountId,
          idempotencyKey:
            c.req.header("Idempotency-Key") ??
            (() => {
              throw new Error("A valid Idempotency-Key is required");
            })(),
        });
        const actor = await container.profiles.get(p.accountId);
        return c.json(
          jsonSafe({
            id: entry.id,
            direction: entry.direction,
            amountMinor: entry.amountMinor.toString(),
            title: entry.title,
            note: entry.note,
            source: null,
            actor: { id: p.accountId, username: p.account.username, email: actor.email },
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
