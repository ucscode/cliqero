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
  const accountBulkDeleteBody = z
    .object({
      action: z.literal("delete"),
      ids: z
        .array(z.uuid().transform((id) => id.toLowerCase()))
        .min(1)
        .max(maxRows)
        .refine((ids) => new Set(ids).size === ids.length),
    })
    .strict();

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/accounts",
      tags: ["Accounts"],
      summary: "Create an account",
      description: "Creates a Cliqero account and requests Better Auth password setup by email.",
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
      tags: ["Accounts"],
      summary: "List accounts",
      description: "Search active accounts using a bounded, cursor-paginated safe projection.",
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
        400: {
          description: "Invalid search or pagination parameters",
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
      tags: ["Accounts"],
      summary: "Get an account",
      description:
        "Returns an account profile and referral/commerce context, including tombstones.",
      request: { params: z.object({ accountId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Safe operator account projection",
          content: { "application/json": { schema: operatorAccountDetailSchema } },
        },
        400: {
          description: "Invalid account ID",
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
      tags: ["Accounts"],
      summary: "Update an account profile",
      description: "Updates supported username and country fields for an active account.",
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

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/operator/accounts/{accountId}",
      tags: ["Accounts"],
      summary: "Delete an account",
      description:
        "Removes authentication and personal profile data, revokes credentials, archives owned listings, reparents direct referrals, and preserves financial and commerce history. Operators cannot delete themselves or the final system.root account; hierarchy roots with descendants must first be reassigned.",
      request: { params: z.object({ accountId: z.uuid() }) },
      responses: {
        204: { description: "Account identity deleted and tombstoned" },
        400: {
          description: "Invalid account ID",
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
          description: "Active account not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Deletion conflicts with account safety rules",
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
        await container.operatorAccountManagement.delete(
          p.accountId,
          c.req.valid("param").accountId,
        );
        return c.body(null, 204);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/accounts/bulk",
      tags: ["Accounts"],
      summary: "Bulk delete accounts",
      description:
        "Deletes 1 to the configured CRUD row limit of distinct account IDs. Outcomes are returned per account; self, final-root, and hierarchy-root safety restrictions are applied independently.",
      request: { body: { content: { "application/json": { schema: accountBulkDeleteBody } } } },
      responses: {
        200: {
          description: "Per-account deletion outcomes",
          content: {
            "application/json": {
              schema: z.object({
                results: z.array(
                  z.discriminatedUnion("deleted", [
                    z.object({ id: z.uuid(), deleted: z.literal(true) }),
                    z.object({ id: z.uuid(), deleted: z.literal(false), error: errorSchema }),
                  ]),
                ),
              }),
            },
          },
        },
        400: {
          description: "Invalid IDs or action",
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
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "accounts.manage", "accounts:manage");
      if (denied) return denied;
      const { ids } = c.req.valid("json");
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            await container.operatorAccountManagement.delete(p.accountId, id);
            return { id, deleted: true as const };
          } catch (error) {
            const publicError =
              error instanceof Error && "code" in error && "status" in error
                ? {
                    error: error.message,
                    code: String(error.code),
                  }
                : { error: "Account deletion failed.", code: "deletion_failed" };
            return { id, deleted: false as const, error: publicError };
          }
        }),
      );
      return c.json({ results }, 200);
    },
  );
}
