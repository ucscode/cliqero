import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { apiScopeSchema } from "@/modules/identity/api/scopes";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../shared/context";
import { domainError } from "../../shared/error";
import { errorSchema } from "../../shared/schemas";
import { operatorApiKeyListSchema } from "./contracts";

export function registerApiKeyRoutes(app: OpenAPIHono<Env>, container: ApplicationContainer) {
  const operatorKeyBody = z
    .object({
      name: z.string().min(1).max(100),
      scopes: z.array(apiScopeSchema).max(20).default([]),
      expires_at: z.string().datetime().nullable().optional(),
    })
    .strict();
  const operatorKeyResult = z
    .object({
      id: z.string().uuid(),
      secret: z.string(),
      name: z.string(),
      scopes: z.array(z.string()),
    })
    .extend({
      key_prefix: z.string(),
      created_at: z.string(),
      expires_at: z.string().nullable(),
    });
  const operatorKeyParams = z.object({ accountId: z.string().uuid() });
  const operatorKeyIdParams = operatorKeyParams.extend({ id: z.string().uuid() });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/accounts/{accountId}/api-keys",
      request: { params: operatorKeyParams },
      responses: {
        200: {
          description: "Safe API-key metadata for the selected account",
          content: {
            "application/json": { schema: operatorApiKeyListSchema },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "API-key administration required",
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
      const denied = requireCapabilityScope(c, p, "api_keys.manage", "api_keys:manage");
      if (denied) return denied;
      try {
        const result = await container.operatorApiKeys.list(
          p.accountId,
          c.req.valid("param").accountId,
        );
        return c.json(
          {
            manageable_scopes: result.manageableScopes,
            items: result.items.map((item) => ({
              id: item.id,
              name: item.name,
              key_prefix: item.keyPrefix,
              scopes: item.scopes,
              created_at: item.createdAt.toISOString(),
              last_used_at: item.lastUsedAt?.toISOString() ?? null,
              expires_at: item.expiresAt?.toISOString() ?? null,
              revoked_at: item.revokedAt?.toISOString() ?? null,
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
      path: "/api/operator/accounts/{accountId}/api-keys",
      request: {
        params: operatorKeyParams,
        body: { content: { "application/json": { schema: operatorKeyBody } } },
      },
      responses: {
        201: {
          description: "New operator-managed key; the secret is shown once",
          content: { "application/json": { schema: operatorKeyResult } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "API-key administration required",
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
      const denied = requireCapabilityScope(c, p, "api_keys.manage", "api_keys:manage");
      if (denied) return denied;
      const body = c.req.valid("json");
      try {
        const created = await container.operatorApiKeys.create(
          p.accountId,
          c.req.valid("param").accountId,
          {
            name: body.name,
            scopes: body.scopes,
            expiresAt: body.expires_at ? new Date(body.expires_at) : null,
          },
        );
        return c.json(
          {
            id: created.id,
            secret: created.secret,
            name: created.name,
            scopes: created.scopes,
            key_prefix: created.keyPrefix,
            created_at: created.createdAt.toISOString(),
            expires_at: created.expiresAt?.toISOString() ?? null,
          },
          201,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/accounts/{accountId}/api-keys/{id}/revoke",
      request: { params: operatorKeyIdParams },
      responses: {
        200: {
          description: "API key revocation result",
          content: { "application/json": { schema: z.object({ changed: z.boolean() }) } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "API-key administration required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Account or key not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "api_keys.manage", "api_keys:manage");
      if (denied) return denied;
      try {
        const result = await container.operatorApiKeys.revoke(
          p.accountId,
          c.req.valid("param").accountId,
          c.req.valid("param").id,
        );
        return c.json({ changed: result.changed }, 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
