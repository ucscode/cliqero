import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { apiScopeSchema } from "@/modules/identity/api/scopes";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../shared/context";
import { domainError } from "../../shared/error";
import { errorSchema } from "../../shared/schemas";

const querySchema = z.object({
  search: z.string().max(200).optional(),
  account_id: z.uuid().optional(),
  state: z.enum(["all", "active", "expired", "deleted"]).default("all"),
  sort: z.enum(["created", "name", "expires"]).default("created"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
const createSchema = z
  .object({
    account_id: z.uuid(),
    name: z.string().min(1).max(100),
    scopes: z.array(apiScopeSchema).max(20).default([]),
    expires_at: z.string().datetime().nullable().optional(),
  })
  .strict();
const patchSchema = z
  .object({
    account_id: z.uuid().optional(),
    name: z.string().min(1).max(100).optional(),
    scopes: z.array(apiScopeSchema).max(20).optional(),
    expires_at: z.string().datetime().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

function metadata(key: {
  id: string;
  name: string;
  accountId: string;
  accountUsername?: string;
  accountEmail?: string | null;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}) {
  const expired = Boolean(key.expiresAt && key.expiresAt <= new Date());
  return {
    id: key.id,
    name: key.name,
    account_id: key.accountId,
    account_username: key.accountUsername ?? "",
    account_email: key.accountEmail ?? null,
    scopes: key.scopes,
    state: key.revokedAt ? "deleted" : expired ? "expired" : "active",
    created_at: key.createdAt.toISOString(),
    last_used_at: key.lastUsedAt?.toISOString() ?? null,
    expires_at: key.expiresAt?.toISOString() ?? null,
    revoked_at: key.revokedAt?.toISOString() ?? null,
  };
}

export function registerApiKeyRoutes(app: OpenAPIHono<Env>, container: ApplicationContainer) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/api-keys",
      tags: ["API keys"],
      summary: "List API keys the operator can manage",
      request: { query: querySchema },
      responses: {
        200: {
          description: "Safe API-key metadata",
          content: {
            "application/json": {
              schema: z.object({ items: z.array(z.any()), manageable_scopes: z.array(z.string()) }),
            },
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
      },
    }),
    async (c) => {
      const principal = requirePrincipal(c);
      if (!(principal instanceof Object) || !("accountId" in principal)) return principal as never;
      const denied = requireCapabilityScope(c, principal, "api_keys.manage", "api_keys:manage");
      if (denied) return denied as never;
      try {
        const query = c.req.valid("query");
        const result = await container.operatorApiKeys.listAll(principal.accountId, {
          search: query.search,
          accountId: query.account_id,
          state: query.state,
          sort: query.sort,
          direction: query.direction,
        });
        return c.json(
          { items: result.items.map(metadata), manageable_scopes: result.manageableScopes },
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );

  app.post("/api/api-keys", async (c) => {
    const principal = requirePrincipal(c);
    if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
    const denied = requireCapabilityScope(c, principal, "api_keys.manage", "api_keys:manage");
    if (denied) return denied;
    try {
      const body = createSchema.parse(await c.req.json());
      const created = await container.operatorApiKeys.create(principal.accountId, body.account_id, {
        name: body.name,
        scopes: body.scopes,
        expiresAt: body.expires_at ? new Date(body.expires_at) : null,
      });
      return c.json(
        {
          ...metadata({
            ...created,
            accountId: body.account_id,
            accountUsername: "",
            accountEmail: null,
            lastUsedAt: null,
            revokedAt: null,
          }),
          secret: created.secret,
        },
        201,
      );
    } catch (error) {
      return domainError(c, error);
    }
  });

  app.get("/api/api-keys/:apiKeyId", async (c) => {
    const principal = requirePrincipal(c);
    if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
    const denied = requireCapabilityScope(c, principal, "api_keys.manage", "api_keys:manage");
    if (denied) return denied;
    try {
      const key = await container.operatorApiKeys.get(principal.accountId, c.req.param("apiKeyId"));
      return c.json({ item: metadata(key) });
    } catch (error) {
      return domainError(c, error);
    }
  });

  app.patch("/api/api-keys/:apiKeyId", async (c) => {
    const principal = requirePrincipal(c);
    if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
    const denied = requireCapabilityScope(c, principal, "api_keys.manage", "api_keys:manage");
    if (denied) return denied;
    try {
      const body = patchSchema.parse(await c.req.json());
      if (body.account_id)
        return c.json({ error: "An API key's owning account cannot be changed." }, 400);
      const key = await container.operatorApiKeys.update(
        principal.accountId,
        c.req.param("apiKeyId"),
        {
          name: body.name,
          scopes: body.scopes,
          expiresAt:
            body.expires_at === undefined
              ? undefined
              : body.expires_at === null
                ? null
                : new Date(body.expires_at),
        },
      );
      return c.json({ item: key ? metadata(key) : null });
    } catch (error) {
      return domainError(c, error);
    }
  });

  app.delete("/api/api-keys/:apiKeyId", async (c) => {
    const principal = requirePrincipal(c);
    if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
    const denied = requireCapabilityScope(c, principal, "api_keys.manage", "api_keys:manage");
    if (denied) return denied;
    try {
      const key = await container.operatorApiKeys.get(principal.accountId, c.req.param("apiKeyId"));
      await container.operatorApiKeys.revoke(principal.accountId, key.accountId, key.id);
      return c.body(null, 204);
    } catch (error) {
      return domainError(c, error);
    }
  });
}
