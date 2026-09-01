import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import type { ApiPrincipal } from "@/modules/identity/api-principal";
import { apiScopeSchema } from "@/modules/identity/api-scopes";
import { dispatchLegacyApi, legacyApiPaths } from "./legacy-dispatch";

type Env = { Variables: { principal: ApiPrincipal | null } };
const errorSchema = z.object({ error: z.string(), code: z.string().optional() });
const nodeSchema = z.object({
  id: z.string(),
  handle: z.string(),
  displayName: z.string().nullable(),
  depth: z.number(),
  directChildCount: z.number(),
  hasChildren: z.boolean(),
  hasMoreChildren: z.boolean(),
  nextChildCursor: z.string().nullable(),
});
const parentSchema = z.object({
  id: z.string(),
  handle: z.string(),
  displayName: z.string().nullable(),
  canNavigate: z.boolean(),
});
const treeSchema = z.object({
  root: z.string(),
  windowDepth: z.number(),
  childLimit: z.number(),
  parent: parentSchema.nullable(),
  nodes: z.array(nodeSchema),
  edges: z.array(z.object({ parent: z.string(), child: z.string() })),
});
const childrenSchema = z.object({
  parentId: z.string(),
  items: z.array(nodeSchema),
  nextCursor: z.string().nullable(),
});
const reassignmentSchema = z.object({
  childAccountId: z.string(),
  parentAccountId: z.string(),
  previousParentAccountId: z.string().nullable(),
  changed: z.boolean(),
});
function principal(c: any) {
  return c.get("principal") as ApiPrincipal | null;
}
function requirePrincipal(c: any) {
  const p = principal(c);
  if (!p) {
    c.header("WWW-Authenticate", "Bearer");
    return c.json({ error: "Unauthorized", code: "unauthorized" }, 401);
  }
  return p;
}
function requireScope(c: any, p: ApiPrincipal, scope: string) {
  if (p.kind === "api_key" && !p.scopes.has(scope)) {
    return c.json({ error: "Forbidden", code: "insufficient_scope" }, 403);
  }
  return null;
}
function grantableScopes(p: ApiPrincipal): Set<string> {
  const allowed = new Set([
    "hierarchy:read",
    "api_keys:manage",
    "catalogue:read",
    "wallet:read",
    "wallet:fund",
    "checkout:create",
    "purchases:read",
    "referrals:read",
    "referrals:manage",
    "earnings:read",
    "withdrawals:read",
    "withdrawals:create",
  ]);
  if (p.roles.includes("catalogue_manager") || p.roles.includes("operator"))
    allowed.add("catalogue:manage");
  if (p.roles.includes("operator"))
    for (const scope of [
      "hierarchy:admin",
      "withdrawals:manage",
      "treasury:read",
      "treasury:manage",
      "operations:manage",
    ])
      allowed.add(scope);
  return allowed;
}
function domainError(c: any, error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  const status =
    message === "Forbidden"
      ? 403
      : message.toLowerCase().includes("not found")
        ? 404
        : message.toLowerCase().includes("already")
          ? 409
          : 400;
  return c.json(
    {
      error: message,
      code:
        status === 403
          ? "forbidden"
          : status === 404
            ? "not_found"
            : status === 409
              ? "conflict"
              : "invalid_request",
    },
    status,
  );
}

export function createApiApp(container: ApplicationContainer) {
  const app = new OpenAPIHono<Env>();
  app.onError((error, c) => domainError(c, error));
  app.use("/api/*", async (c, next) => {
    const p = await container.principalResolver.resolve(c.req.raw);
    c.set("principal", p);
    await next();
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/openapi.json",
      responses: {
        200: {
          description: "OpenAPI document",
          content: { "application/json": { schema: z.any() } },
        },
      },
    }),
    (c) => {
      const document = app.getOpenAPIDocument({
        openapi: "3.0.0",
        info: { title: "Cliqero API", version: "1.0.0" },
        servers: [{ url: "/" }],
      }) as any;
      const response = {
        description: "Application API response",
        content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
      };
      const errorResponse = {
        description: "Request error",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { error: { type: "string" }, code: { type: "string" } },
              required: ["error"],
            },
          },
        },
      };
      for (const route of legacyApiPaths) {
        const path = (document.paths[route.path] ??= {});
        for (const routeMethod of route.methods) {
          const operation = routeMethod.method.toLowerCase();
          path[operation] ??= {
            "x-authentication-mode": routeMethod.access.mode,
            ...(routeMethod.access.scope
              ? { "x-required-api-scope": routeMethod.access.scope }
              : {}),
            responses: {
              "200": response,
              "400": errorResponse,
              "401": errorResponse,
              "403": errorResponse,
              "404": errorResponse,
            },
          };
        }
      }
      return c.json(document);
    },
  );
  const queryTree = z.object({ root: z.string().uuid().optional() });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/hierarchy/tree",
      request: { query: queryTree },
      responses: {
        200: {
          description: "Hierarchy window",
          content: { "application/json": { schema: treeSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Not permitted",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "hierarchy:read");
      if (denied) return denied;
      const root = c.req.valid("query").root ?? p.accountId;
      const admin =
        p.roles.includes("operator") &&
        (p.kind === "user_session" || p.scopes.has("hierarchy:admin"));
      try {
        return c.json(await container.hierarchy.tree(p.accountId, root, admin), 200);
      } catch (error) {
        return c.json(
          { error: error instanceof Error ? error.message : "Request failed", code: "forbidden" },
          403,
        );
      }
    },
  );
  const searchQuery = z.object({
    q: z.string().min(1).max(100),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/hierarchy/search",
      request: { query: searchQuery },
      responses: {
        200: {
          description: "Matching accounts",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(
                  z.object({
                    id: z.string(),
                    handle: z.string(),
                    displayName: z.string().nullable(),
                  }),
                ),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "hierarchy:read");
      if (denied) return denied;
      const q = c.req.valid("query");
      const admin =
        p.roles.includes("operator") &&
        (p.kind === "user_session" || p.scopes.has("hierarchy:admin"));
      const items = await container.hierarchy.search(p.accountId, q.q, admin, q.limit);
      return c.json({ items }, 200);
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/hierarchy/children/{parentId}",
      request: {
        params: z.object({ parentId: z.string().uuid() }),
        query: z.object({ cursor: z.string().uuid().optional() }),
      },
      responses: {
        200: {
          description: "One child batch",
          content: { "application/json": { schema: childrenSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Not permitted",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "hierarchy:read");
      if (denied) return denied;
      const admin =
        p.roles.includes("operator") &&
        (p.kind === "user_session" || p.scopes.has("hierarchy:admin"));
      try {
        return c.json(
          await container.hierarchy.children(
            p.accountId,
            c.req.valid("param").parentId,
            admin,
            c.req.valid("query").cursor,
          ),
          200,
        );
      } catch (error) {
        return c.json(
          { error: error instanceof Error ? error.message : "Request failed", code: "forbidden" },
          403,
        );
      }
    },
  );
  app.openapi(
    createRoute({
      method: "put",
      path: "/api/operator/hierarchy/{accountId}/parent",
      request: {
        params: z.object({ accountId: z.string().uuid() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({ parent_account_id: z.string().uuid() }).strict(),
            },
          },
        },
      },
      responses: {
        200: {
          description: "Parent assignment",
          content: { "application/json": { schema: reassignmentSchema } },
        },
        400: {
          description: "Invalid or cyclic relationship",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator required",
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
      const denied = requireScope(c, p, "hierarchy:admin");
      if (denied) return denied;
      if (!p.roles.includes("operator"))
        return c.json({ error: "Forbidden", code: "forbidden" }, 403);
      try {
        const result = await container.referralGraphService.reassignParent(
          c.req.valid("param").accountId,
          c.req.valid("json").parent_account_id,
          p.accountId,
        );
        return c.json(result, 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  const keyBody = z
    .object({
      name: z.string().min(1).max(100),
      scopes: z.array(apiScopeSchema).max(20).default([]),
      expires_at: z.string().datetime().nullable().optional(),
      account_id: z.string().uuid().optional(),
    })
    .strict();
  const keyMetadataSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    key_prefix: z.string(),
    scopes: z.array(z.string()),
    created_at: z.string(),
    last_used_at: z.string().nullable(),
    expires_at: z.string().nullable(),
    revoked_at: z.string().nullable(),
  });
  const userKeyBody = z
    .object({
      name: z.string().min(1).max(100),
      scopes: z.array(apiScopeSchema).max(20).default([]),
      expires_at: z.string().datetime().nullable().optional(),
    })
    .strict();
  const userKeyResult = z.object({
    id: z.string().uuid(),
    secret: z.string(),
    name: z.string(),
    scopes: z.array(z.string()),
  });
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/api-keys",
      request: { body: { content: { "application/json": { schema: userKeyBody } } } },
      responses: {
        201: {
          description: "New personal API key; the secret is shown once",
          content: { "application/json": { schema: userKeyResult } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        400: {
          description: "Invalid key request",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "api_keys:manage");
      if (denied) return denied;
      const body = c.req.valid("json");
      const unsupported = body.scopes.find((scope) => !grantableScopes(p).has(scope));
      if (unsupported)
        return c.json(
          { error: "This account cannot grant that API key scope", code: "insufficient_scope" },
          403,
        );
      if (body.expires_at && new Date(body.expires_at) <= new Date())
        return c.json({ error: "Expiry must be in the future", code: "invalid_request" }, 400);
      try {
        return c.json(
          await container.apiKeys.create({
            accountId: p.accountId,
            name: body.name,
            scopes: body.scopes,
            createdBy: p.accountId,
            expiresAt: body.expires_at ? new Date(body.expires_at) : null,
          }),
          201,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/api-keys",
      responses: {
        200: {
          description: "Personal API key metadata",
          content: {
            "application/json": { schema: z.object({ items: z.array(keyMetadataSchema) }) },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "api_keys:manage");
      if (denied) return denied;
      const items = await container.apiKeys.list(p.accountId);
      return c.json(
        {
          items: items.map((item) => ({
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
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/api-keys/{id}/revoke",
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: {
        204: { description: "Key revoked" },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Key not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "api_keys:manage");
      if (denied) return denied;
      const changed = await container.apiKeys.revoke(c.req.valid("param").id, p.accountId);
      if (!changed) return c.json({ error: "API key not found", code: "not_found" }, 404);
      return c.body(null, 204);
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/api-keys",
      request: { body: { content: { "application/json": { schema: keyBody } } } },
      responses: {
        201: {
          description: "New key (secret shown once)",
          content: {
            "application/json": {
              schema: z.object({
                id: z.string(),
                secret: z.string(),
                name: z.string(),
                scopes: z.array(z.string()),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "api_keys:manage");
      if (denied) return denied;
      if (!p.roles.includes("operator"))
        return c.json({ error: "Forbidden", code: "forbidden" }, 403);
      const b = c.req.valid("json");
      const result = await container.apiKeys.create({
        accountId: b.account_id ?? p.accountId,
        name: b.name,
        scopes: b.scopes,
        createdBy: p.accountId,
        expiresAt: b.expires_at ? new Date(b.expires_at) : null,
      });
      return c.json(result, 201);
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/api-keys",
      responses: {
        200: {
          description: "API keys",
          content: { "application/json": { schema: z.object({ items: z.array(z.any()) }) } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "api_keys:manage");
      if (denied) return denied;
      if (!p.roles.includes("operator"))
        return c.json({ error: "Forbidden", code: "forbidden" }, 403);
      return c.json({ items: await container.apiKeys.list() }, 200);
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/api-keys/{id}/revoke",
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: {
        204: { description: "Key revoked" },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Operator required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireScope(c, p, "api_keys:manage");
      if (denied) return denied;
      if (!p.roles.includes("operator"))
        return c.json({ error: "Forbidden", code: "forbidden" }, 403);
      await container.apiKeys.revoke(c.req.valid("param").id);
      return c.body(null, 204);
    },
  );

  // Compatibility handlers are internal adapters around the same application
  // services. This fallback keeps one authoritative HTTP router while legacy
  // Request/Response contracts remain available to existing clients.
  app.all("/api/*", async (c) => {
    const response = await dispatchLegacyApi(c.req.raw, c.get("principal"));
    return response ?? c.json({ error: "Not found", code: "not_found" }, 404);
  });
  return app;
}
