import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { canAccessOperator, hasCapability } from "@/modules/identity/capabilities";
import { hierarchyReadOrAdmin, requirePrincipal, requireScope, type Env } from "../shared/context";
import { domainError } from "../shared/error";
import { errorSchema } from "../shared/schemas";
import { childrenSchema, reassignmentSchema, treeSchema } from "./hierarchy/contracts";
import { operatorOverviewSchema } from "./hierarchy/overview-contract";

export function registerHierarchyRoutes(app: OpenAPIHono<Env>, container: ApplicationContainer) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/overview",
      responses: {
        200: {
          description: "Capability-scoped operator overview",
          content: { "application/json": { schema: operatorOverviewSchema } },
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
      if (!canAccessOperator(p.capabilities))
        return c.json({ error: "Forbidden", code: "forbidden" }, 403) as never;
      const denied = requireScope(c, p, "operations:manage");
      if (denied) return denied;
      return c.json(await container.operatorOverview.get(p.capabilities), 200) as never;
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
      const denied = hierarchyReadOrAdmin(c, p);
      if (denied) return denied;
      const root = c.req.valid("query").root ?? p.accountId;
      const admin =
        hasCapability(p.capabilities, "hierarchy.manage") &&
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
                    username: z.string(),
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
      const denied = hierarchyReadOrAdmin(c, p);
      if (denied) return denied;
      const q = c.req.valid("query");
      const admin =
        hasCapability(p.capabilities, "hierarchy.manage") &&
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
      const denied = hierarchyReadOrAdmin(c, p);
      if (denied) return denied;
      const admin =
        hasCapability(p.capabilities, "hierarchy.manage") &&
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
      if (!hasCapability(p.capabilities, "hierarchy.manage"))
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
}
