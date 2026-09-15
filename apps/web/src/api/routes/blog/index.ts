import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { blogPostInputSchema } from "@/modules/blog/domain/blog";
import type { Env } from "../../shared/context";
import { requirePrincipal, requireCapabilityScope } from "../../shared/context";
import { errorSchema } from "../../shared/schemas";
import { domainError } from "../../shared/error";
import { blogJson } from "./serialization";
import { blogPageSchema, blogPostSchema } from "./contracts";

export function registerBlogRoutes(app: OpenAPIHono<Env>, container: ApplicationContainer) {
  const blogListQuery = z.object({
    search: z.string().max(100).optional(),
    status: z.enum(["draft", "published"]).optional(),
    category: z.string().max(100).optional(),
    tag: z.string().max(100).optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/blog/posts",
      request: { query: blogListQuery },
      responses: {
        200: {
          description: "Published blog posts",
          content: { "application/json": { schema: blogPageSchema } },
        },
      },
    }),
    (c) => {
      try {
        const page = container.blog.list({ ...c.req.valid("query"), publishedOnly: true });
        return c.json({ ...page, items: page.items.map(blogJson) }, 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/blog/posts/{slug}",
      request: { params: z.object({ slug: z.string().min(1).max(160) }) },
      responses: {
        200: {
          description: "Published blog post",
          content: { "application/json": { schema: blogPostSchema } },
        },
        404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
      },
    }),
    (c) => {
      const post = container.blog.get(c.req.valid("param").slug, true);
      return post
        ? c.json(blogJson(post), 200)
        : c.json({ error: "Blog post not found", code: "not_found" }, 404);
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/blog/categories",
      responses: {
        200: {
          description: "Blog categories",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(z.object({ id: z.string(), slug: z.string(), name: z.string() })),
              }),
            },
          },
        },
      },
    }),
    (c) =>
      c.json(
        { items: container.blog.categories() as Array<{ id: string; slug: string; name: string }> },
        200,
      ),
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/blog/tags",
      responses: {
        200: {
          description: "Blog tags",
          content: {
            "application/json": {
              schema: z.object({
                items: z.array(z.object({ id: z.string(), slug: z.string(), name: z.string() })),
              }),
            },
          },
        },
      },
    }),
    (c) =>
      c.json(
        { items: container.blog.tags() as Array<{ id: string; slug: string; name: string }> },
        200,
      ),
  );
  const blogAdminListQuery = blogListQuery.extend({});
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/blog",
      request: { query: blogAdminListQuery },
      responses: {
        200: {
          description: "Operator blog posts",
          content: { "application/json": { schema: blogPageSchema } },
        },
        403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:read");
      if (denied) return denied;
      const page = container.blog.list(c.req.valid("query"));
      return c.json({ ...page, items: page.items.map(blogJson) }, 200);
    },
  );
  const blogWriteBody = blogPostInputSchema;
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/blog/posts",
      request: {
        headers: z.object({ "idempotency-key": z.string().trim().min(1).max(200) }),
        body: { content: { "application/json": { schema: blogWriteBody } } },
      },
      responses: {
        201: {
          description: "Blog post created",
          content: { "application/json": { schema: blogPostSchema } },
        },
        403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:write");
      if (denied) return denied;
      try {
        const body = c.req.valid("json");
        if (body.status === "published" && p.kind === "api_key" && !p.scopes.has("blog:publish"))
          return c.json({ error: "Forbidden", code: "insufficient_scope" }, 403);
        const key = c.req.header("Idempotency-Key");
        if (!key) throw new Error("Idempotency-Key is required");
        return c.json(blogJson(container.blog.create(body, p.accountId, key)), 201);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/blog/posts/{id}",
      request: {
        params: z.object({ id: z.string().uuid() }),
        body: { content: { "application/json": { schema: blogWriteBody.partial() } } },
      },
      responses: {
        200: {
          description: "Blog post updated",
          content: { "application/json": { schema: blogPostSchema } },
        },
        403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:write");
      if (denied) return denied;
      try {
        const body = c.req.valid("json");
        if (body.status === "published" && p.kind === "api_key" && !p.scopes.has("blog:publish"))
          return c.json({ error: "Forbidden", code: "insufficient_scope" }, 403);
        return c.json(blogJson(container.blog.update(c.req.valid("param").id, body)), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  for (const [path, published] of [
    ["/api/blog/posts/{id}/publish", true],
    ["/api/blog/posts/{id}/unpublish", false],
  ] as const) {
    app.openapi(
      createRoute({
        method: "post",
        path,
        request: { params: z.object({ id: z.string().uuid() }) },
        responses: {
          200: {
            description: "Blog publication state changed",
            content: { "application/json": { schema: blogPostSchema } },
          },
          403: {
            description: "Forbidden",
            content: { "application/json": { schema: errorSchema } },
          },
        },
      }),
      (c) => {
        const p = requirePrincipal(c);
        if (!(p instanceof Object) || !("accountId" in p)) return p;
        const denied = requireCapabilityScope(c, p, "content.manage", "blog:publish");
        if (denied) return denied;
        try {
          return c.json(blogJson(container.blog.publish(c.req.valid("param").id, published)), 200);
        } catch (error) {
          return domainError(c, error);
        }
      },
    );
  }
  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/blog/posts/{id}",
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: {
        204: { description: "Blog post deleted" },
        403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:manage");
      if (denied) return denied;
      try {
        container.blog.delete(c.req.valid("param").id);
        return c.body(null, 204);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
