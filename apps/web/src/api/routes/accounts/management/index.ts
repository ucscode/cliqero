import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../../shared/context";
import { domainError } from "../../../shared/error";
import { errorSchema } from "../../../shared/schemas";
import { usernameSchema } from "@/modules/identity/username";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/modules/identity/password-policy";
import { operatorAccountDetailSchema, operatorAccountSummarySchema } from "./contracts";
import { crudMaxRows } from "@/config/crud";
import { registerAccount } from "@/api/compat/accounts/route";

export function registerAccountManagementRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  const maxRows = crudMaxRows();
  const accountListQuery = z.object({
    search: z.string().max(100).optional(),
    sort: z
      .enum(["created", "username"])
      .default("created")
      .describe("Sort by created date or username."),
    direction: z.enum(["asc", "desc"]).default("desc").describe("Sort direction."),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(maxRows).default(maxRows),
  });
  const credentialSetupSchema = z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("email") }).strict(),
    z
      .object({
        mode: z.literal("password"),
        password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
        confirm_password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
      })
      .strict()
      .refine((value) => value.password === value.confirm_password, {
        path: ["confirm_password"],
        message: "Passwords do not match.",
      }),
  ]);
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
      credential_setup: credentialSetupSchema.default({ mode: "email" }),
      notify_user: z.boolean().default(true),
    })
    .strict();
  const publicRegistrationBody = z
    .object({
      email: z.email(),
      username: usernameSchema,
      password: z.string().min(12),
      country: z.string().regex(/^[A-Za-z]{2}$/),
      captchaToken: z.string().optional(),
    })
    .strict();
  const accountPostBody = z.union([accountCreateBody, publicRegistrationBody]);
  const publicRegistrationResponse = z.object({
    id: z.string(),
    email: z.string(),
    username: z.string(),
    country: z.string().nullable(),
  });
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
      path: "/api/accounts",
      tags: ["Accounts"],
      summary: "Create an account",
      description: "Creates a Cliqero account and requests Better Auth password setup by email.",
      request: { body: { content: { "application/json": { schema: accountPostBody } } } },
      responses: {
        201: {
          description: "Created account with password setup initiated by email",
          content: {
            "application/json": {
              schema: z.union([
                z.object({
                  account: operatorAccountDetailSchema,
                  credentialSetupMode: z.enum(["email", "password"]),
                  passwordSetupEmailRequested: z.boolean(),
                  accountCreatedEmailRequested: z.boolean(),
                }),
                publicRegistrationResponse,
              ]),
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
      const current = c.get("principal");
      if (current.kind === "anonymous") {
        if (c.req.header("authorization"))
          return c.json({ error: "Unauthorized", code: "unauthorized" }, 401);
        if (!("password" in c.req.valid("json")))
          return c.json({ error: "Unauthorized", code: "unauthorized" }, 401);
        return (await registerAccount(c.req.raw, container)) as never;
      }
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "accounts.manage", "accounts:manage");
      if (denied) return denied;
      try {
        const body = c.req.valid("json");
        if ("credential_setup" in body) {
          const { credential_setup, notify_user, ...identity } = body;
          const created = await container.operatorAccountManagement.create(p.accountId, {
            ...identity,
            credentialSetup: credential_setup,
            notifyUser: credential_setup.mode === "email" ? true : notify_user,
          });
          return c.json(created, 201);
        }
        return c.json({ error: "Forbidden", code: "forbidden" }, 403);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/accounts",
      tags: ["Accounts"],
      summary: "List accounts",
      description: "Search active accounts using a bounded, cursor-paginated safe projection.",
      request: { query: accountListQuery },
      responses: {
        200: {
          description: "Bounded account administration search",
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
          description: "Account administration permission required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "accounts.read", "accounts:read");
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
      path: "/api/accounts/{accountId}",
      tags: ["Accounts"],
      summary: "Get an account",
      description:
        "Returns an account profile and referral/commerce context, including tombstones.",
      request: { params: z.object({ accountId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Safe account administration projection",
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
          description: "Account administration permission required",
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
      const denied = requireCapabilityScope(c, p, "accounts.read", "accounts:read");
      if (denied) return denied;
      try {
        return c.json(
          await container.operatorAccountManagement.get(c.req.valid("param").accountId),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/accounts/{accountId}",
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
      path: "/api/accounts/{accountId}",
      tags: ["Accounts"],
      summary: "Delete an account",
      description:
        "Removes authentication and personal profile data, revokes credentials, archives owned listings, detaches immediate referrals as new roots, and preserves financial and commerce history. Operators cannot delete themselves or the final system.root account.",
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
}
