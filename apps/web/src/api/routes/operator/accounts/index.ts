import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../../shared/context";
import { domainError } from "../../../shared/error";
import { errorSchema } from "../../../shared/schemas";
import { usernameSchema } from "@/modules/identity/username";
import { operatorAccountDetailSchema, operatorAccountSummarySchema } from "./contracts";
import { crudMaxRows } from "@/config/crud";

export function registerOperatorAccountRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  const maxRows = crudMaxRows();
  const accountListQuery = z.object({
    search: z.string().max(100).optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(maxRows).default(maxRows),
  });
  const accountCreateBody = z
    .object({
      email: z.email().trim().max(254),
      username: usernameSchema,
      country: z
        .string()
        .trim()
        .regex(/^[A-Za-z]{2}$/)
        .transform((value) => value.toUpperCase())
        .optional(),
    })
    .strict();
  const accountUpdateBody = z
    .object({
      username: usernameSchema.optional(),
      country: z
        .string()
        .trim()
        .regex(/^[A-Za-z]{2}$/)
        .transform((value) => value.toUpperCase())
        .nullable()
        .optional(),
    })
    .strict()
    .refine((value) => value.username !== undefined || value.country !== undefined, {
      message: "Provide at least one supported profile field.",
    });

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/accounts",
      request: { body: { content: { "application/json": { schema: accountCreateBody } } } },
      responses: {
        201: {
          description: "Created account with password setup initiated by email",
          content: {
            "application/json": {
              schema: z.object({
                account: operatorAccountDetailSchema,
                passwordSetupEmailRequested: z.boolean(),
              }),
            },
          },
        },
        400: {
          description: "Invalid account details",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Account management permission required",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Username conflict",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "accounts.manage", "accounts:manage");
      if (denied) return denied;
      try {
        const created = await container.operatorAccountManagement.create(
          p.accountId,
          c.req.valid("json"),
        );
        return c.json(created, 201);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/accounts",
      request: { query: accountListQuery },
      responses: {
        200: {
          description: "Bounded operator account search",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(operatorAccountSummarySchema),
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
      const denied = requireCapabilityScope(c, p, "accounts.read", "operations:manage");
      if (denied) return denied;
      try {
        return c.json(await container.operatorAccounts.list(c.req.valid("query")), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/accounts/{accountId}",
      request: { params: z.object({ accountId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Safe operator account projection",
          content: { "application/json": { schema: operatorAccountDetailSchema } },
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
          description: "Account not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "accounts.read", "operations:manage");
      if (denied) return denied;
      try {
        return c.json(await container.operatorAccounts.get(c.req.valid("param").accountId), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/operator/accounts/{accountId}",
      request: {
        params: z.object({ accountId: z.string().uuid() }),
        body: { content: { "application/json": { schema: accountUpdateBody } } },
      },
      responses: {
        200: {
          description: "Updated supported account profile fields",
          content: { "application/json": { schema: operatorAccountDetailSchema } },
        },
        400: {
          description: "Invalid account details",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Account management permission required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Account not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Username conflict",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "accounts.manage", "accounts:manage");
      if (denied) return denied;
      try {
        return c.json(
          await container.operatorAccountManagement.update(
            p.accountId,
            c.req.valid("param").accountId,
            c.req.valid("json"),
          ),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
