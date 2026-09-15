import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../shared/context";
import { domainError } from "../../shared/error";
import { errorSchema } from "../../shared/schemas";
import {
  fundingStateSchema,
  operatorFundingDetailSchema,
  operatorFundingSummarySchema,
} from "./funding/contracts";

export function registerOperatorFundingRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  const operatorFundingQuery = z.object({
    search: z.string().max(100).optional(),
    state: fundingStateSchema.optional(),
    provider: z
      .string()
      .regex(/^[a-z0-9_-]{1,50}$/)
      .optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/funding",
      request: { query: operatorFundingQuery },
      responses: {
        200: {
          description: "Bounded operator funding inspection",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(operatorFundingSummarySchema),
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
      const denied = requireCapabilityScope(c, p, "finance.read", "operations:manage");
      if (denied) return denied;
      try {
        return c.json(await container.operatorFunding.list(c.req.valid("query")), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/funding/{fundingId}",
      request: { params: z.object({ fundingId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Safe operator funding detail",
          content: { "application/json": { schema: operatorFundingDetailSchema } },
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
          description: "Funding not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "finance.read", "operations:manage");
      if (denied) return denied;
      try {
        return c.json(await container.operatorFunding.get(c.req.valid("param").fundingId), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/funding/{fundingId}/confirm-bank-transfer",
      request: { params: z.object({ fundingId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Bank-transfer funding confirmed",
          content: {
            "application/json": {
              schema: z.object({
                id: z.string().uuid(),
                state: z.literal("confirmed"),
                confirmedAt: z.string().nullable(),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Finance management capability required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Funding not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "finance.manage", "operations:manage");
      if (denied) return denied;
      try {
        return c.json(
          await container.operatorFunding.confirmBankTransfer(
            p.accountId,
            c.req.valid("param").fundingId,
          ),
          200,
        ) as never;
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
