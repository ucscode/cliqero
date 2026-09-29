import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import {
  blogCategoryNameSchema,
  blogCategorySlugSchema,
  BlogCategoryConflictError,
  BlogCategoryInUseError,
  BlogCategoryNotFoundError,
  blogPostInputSchema,
} from "@/modules/blog/domain/blog";
import type { Env } from "../../shared/context";
import { requirePrincipal, requireCapabilityScope } from "../../shared/context";
import { errorSchema } from "../../shared/schemas";
import { domainError } from "../../shared/error";
import { blogJson, operatorBlogJson } from "./serialization";
import {
  blogPageSchema,
  blogPostSchema,
  operatorBlogPageSchema,
  operatorBlogPostSchema,
} from "./contracts";
import { loadOperatorTableConfiguration } from "@/config/operator-tables";

const blogCategorySchema = z.object({ id: z.string().uuid(), slug: z.string(), name: z.string() });
const blogCategoryCreateSchema = z
  .object({
    name: z.string(),
    slug: z.string().optional(),
  })
  .strict();
const blogCategoryPatchSchema = z
  .object({ name: z.string().optional(), slug: z.string().optional() })
  .strict()
  .refine(
    (value) => value.name !== undefined || value.slug !== undefined,
    "Provide a name or slug.",
  );

function categoryConflict(c: Parameters<typeof domainError>[0], error: unknown) {
  if (error instanceof BlogCategoryConflictError)
    return c.json({ error: error.message, code: `category_${error.field}_conflict` }, 409);
  if (error instanceof BlogCategoryNotFoundError)
    return c.json({ error: error.message, code: "not_found" }, 404);
  return domainError(c, error);
}

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
  const previewBody = blogPostInputSchema.extend({
    preview_id: z.string().uuid().nullable().optional(),
  });
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/blog/preview",
      request: { body: { content: { "application/json": { schema: previewBody } } } },
      responses: {
        200: {
          description: "Private short-lived preview snapshot",
          content: {
            "application/json": {
              schema: z.object({ previewId: z.string().uuid(), url: z.string() }),
            },
          },
        },
        403: {
          description: "Operator session required",
          content: { "application/json": { schema: errorSchema } },
        },
        400: {
          description: "Invalid article input",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      if (p.kind !== "user_session") return c.json({ error: "Forbidden", code: "forbidden" }, 403);
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:write");
      if (denied) return denied;
      try {
        const { preview_id, ...input } = c.req.valid("json");
        const result = container.blog.createPreview(input, p.accountId, preview_id ?? undefined);
        return c.json({ previewId: result.id, url: result.url }, 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/operator/blog/preview/{previewId}",
      request: { params: z.object({ previewId: z.string().uuid() }) },
      responses: {
        204: { description: "Owned preview removed" },
        403: {
          description: "Operator session required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      if (p.kind !== "user_session") return c.json({ error: "Forbidden", code: "forbidden" }, 403);
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:write");
      if (denied) return denied;
      container.blog.deletePreview(c.req.valid("param").previewId, p.accountId);
      return c.body(null, 204);
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/blog/bulk",
      description: "Bounded article deletion. Requires the blog:manage scope.",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z
                .object({
                  action: z.literal("delete"),
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
      const { ids } = c.req.valid("json");
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:manage");
      if (denied) return denied;
      const results = ids.map((id) => {
        try {
          container.blog.delete(id);
          return { id, success: true as const };
        } catch (error) {
          return {
            id,
            success: false as const,
            error: error instanceof Error ? error.message : "Unable to delete article.",
          };
        }
      });
      return c.json({ results }, 200);
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
      request: { body: { content: { "application/json": { schema: blogCategoryCreateSchema } } } },
      responses: {
        201: {
          description: "Blog category created",
          content: { "application/json": { schema: blogCategorySchema } },
        },
        403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
        400: {
          description: "Invalid category input or slug",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Category name or slug is already in use",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Category not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:write");
      if (denied) return denied;
      try {
        const body = c.req.valid("json");
        const name = blogCategoryNameSchema.parse(body.name);
        const slug = body.slug === undefined ? undefined : body.slug.trim();
        if (slug) blogCategorySlugSchema.parse(slug);
        return c.json(container.blog.createCategory(name, slug), 201);
      } catch (error) {
        return categoryConflict(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/operator/blog/categories/{categoryId}",
      request: {
        params: z.object({ categoryId: z.string().uuid() }),
        body: { content: { "application/json": { schema: blogCategoryPatchSchema } } },
      },
      responses: {
        200: {
          description: "Blog category updated",
          content: { "application/json": { schema: blogCategorySchema } },
        },
        403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
        400: {
          description: "Invalid category input or slug",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Category not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Category name or slug is already in use",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:write");
      if (denied) return denied;
      try {
        return c.json(
          container.blog.updateCategory(c.req.valid("param").categoryId, c.req.valid("json")),
          200,
        );
      } catch (error) {
        return categoryConflict(c, error);
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
          content: { "application/json": { schema: operatorBlogPageSchema } },
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
      return c.json({ ...page, items: page.items.map(operatorBlogJson) }, 200);
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
          description: "Blog article created",
          content: { "application/json": { schema: operatorBlogPostSchema } },
        },
        403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
        400: {
          description: "Invalid article input",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Article slug conflict",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:write");
      if (denied) return denied;
      try {
        const body = c.req.valid("json");
        if (body.status === "published") {
          const publishDenied = requireCapabilityScope(c, p, "content.manage", "blog:publish");
          if (publishDenied) return publishDenied;
        }
        const key = c.req.header("Idempotency-Key");
        if (!key) throw new Error("Idempotency-Key is required");
        return c.json(operatorBlogJson(container.blog.create(body, p.accountId, key)), 201);
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
          description: "Canonical blog article saved",
          content: { "application/json": { schema: operatorBlogPostSchema } },
        },
        403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
        400: {
          description: "Invalid article input",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Article not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Article slug conflict",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:write");
      if (denied) return denied;
      try {
        const body = c.req.valid("json");
        const current = container.blog.get(c.req.valid("param").id);
        if ((body.status ?? current?.status) === "published") {
          const publishDenied = requireCapabilityScope(c, p, "content.manage", "blog:publish");
          if (publishDenied) return publishDenied;
        }
        return c.json(
          operatorBlogJson(container.blog.save(c.req.valid("param").id, body, p.accountId)),
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
      path: "/api/blog/posts/{id}",
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: {
        204: { description: "Blog article and its relations deleted" },
        403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
        404: {
          description: "Article not found",
          content: { "application/json": { schema: errorSchema } },
        },
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
