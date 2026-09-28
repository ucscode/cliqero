import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { blogPostInputSchema } from "@/modules/blog/domain/blog";
import type { Env } from "../../shared/context";
import { requirePrincipal, requireCapabilityScope } from "../../shared/context";
import { errorSchema } from "../../shared/schemas";
import { domainError } from "../../shared/error";
import { blogJson } from "./serialization";
import { blogPageSchema, blogPostSchema } from "./contracts";
import { loadOperatorTableConfiguration } from "@/config/operator-tables";
import { BlogCategoryInUseError } from "@/modules/blog/domain/blog";
import { issueBlogPreviewToken } from "@/security/blog-preview";

const blogCategorySchema = z.object({ id: z.string().uuid(), slug: z.string(), name: z.string() });
const blogCategoryInputSchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();

export function registerBlogRoutes(app: OpenAPIHono<Env>, container: ApplicationContainer) {
  const tableConfiguration = loadOperatorTableConfiguration().tables;
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
      method: "post",
      path: "/api/operator/blog/posts/{id}/preview",
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: {
        200: {
          description: "Short-lived draft preview URL",
          content: { "application/json": { schema: z.object({ url: z.string() }) } },
        },
        403: {
          description: "Authenticated Operator session required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Draft not found",
          content: { "application/json": { schema: errorSchema } },
        },
        500: {
          description: "Preview signing is not configured",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      if (p.kind !== "user_session") return c.json({ error: "Forbidden", code: "forbidden" }, 403);
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:read");
      if (denied) return denied;
      const id = c.req.valid("param").id;
      const post = container.blog.get(id);
      if (!post || post.status !== "draft")
        return c.json({ error: "Draft not found", code: "not_found" }, 404);
      const secret = process.env.BETTER_AUTH_SECRET?.trim();
      if (!secret)
        return c.json({ error: "Preview is unavailable", code: "configuration_error" }, 500);
      const token = issueBlogPreviewToken(id, p.accountId, secret);
      return c.json(
        { url: `/blog/preview/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}` },
        200,
      );
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/blog/bulk",
      description: "Bounded content bulk operations. Requires the blog:manage scope.",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z
                .object({
                  action: z.enum(["publish", "unpublish", "delete"]),
                  ids: z
                    .array(z.string().uuid())
                    .min(1)
                    .max(tableConfiguration.max_bulk_selection)
                    .refine((ids) => new Set(ids).size === ids.length, "ids must be unique"),
                })
                .strict(),
            },
          },
        },
      },
      responses: {
        200: {
          description: "Per-article bulk outcomes",
          content: {
            "application/json": {
              schema: z.object({
                results: z.array(
                  z.object({ id: z.string(), success: z.boolean(), error: z.string().optional() }),
                ),
              }),
            },
          },
        },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const { action, ids } = c.req.valid("json");
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:manage");
      if (denied) return denied;
      return c.json(
        { results: container.blog.bulk(ids, action, tableConfiguration.max_bulk_selection) },
        200,
      );
    },
  );
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
  const blogAdminListQuery = blogListQuery.extend({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(tableConfiguration.max_page_size)
      .default(tableConfiguration.default_page_size),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/blog/categories",
      responses: {
        200: {
          description: "Managed blog categories",
          content: {
            "application/json": { schema: z.object({ items: z.array(blogCategorySchema) }) },
          },
        },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:read");
      if (denied) return denied;
      return c.json({ items: container.blog.categories() }, 200);
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/blog/categories",
      request: { body: { content: { "application/json": { schema: blogCategoryInputSchema } } } },
      responses: {
        201: {
          description: "Blog category created",
          content: { "application/json": { schema: blogCategorySchema } },
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
        return c.json(container.blog.createCategory(c.req.valid("json").name), 201);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/operator/blog/categories/{categoryId}",
      request: {
        params: z.object({ categoryId: z.string().uuid() }),
        body: { content: { "application/json": { schema: blogCategoryInputSchema } } },
      },
      responses: {
        200: {
          description: "Blog category updated",
          content: { "application/json": { schema: blogCategorySchema } },
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
        return c.json(
          container.blog.updateCategory(c.req.valid("param").categoryId, c.req.valid("json").name),
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
      path: "/api/operator/blog/categories/{categoryId}",
      request: { params: z.object({ categoryId: z.string().uuid() }) },
      responses: {
        204: { description: "Unused blog category deleted" },
        409: {
          description: "Category is still assigned to an article",
          content: { "application/json": { schema: errorSchema } },
        },
        403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:manage");
      if (denied) return denied;
      try {
        container.blog.deleteCategory(c.req.valid("param").categoryId);
        return c.body(null, 204);
      } catch (error) {
        if (error instanceof BlogCategoryInUseError)
          return c.json({ error: error.message, code: "category_in_use" }, 409);
        return domainError(c, error);
      }
    },
  );
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
