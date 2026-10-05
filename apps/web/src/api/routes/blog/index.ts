import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import {
  blogCategoryNameSchema,
  blogCategorySlugSchema,
  BlogCategoryConflictError,
  BlogCategoryNotFoundError,
  blogPostInputSchema,
} from "@/modules/blog/domain/blog";
import type { Env } from "../../shared/context";
import { requirePrincipal, requireCapabilityScope } from "../../shared/context";
import { errorSchema } from "../../shared/schemas";
import { domainError } from "../../shared/error";
import { blogJson, operatorBlogJson } from "./serialization";
import { blogPageSchema, blogPostSchema, operatorBlogPostSchema } from "./contracts";
import { crudMaxRows } from "@/config/crud";
import { deleteResourceIds, resourceDeleteSchema } from "../../shared/resource-delete";

const blogCategorySchema = z.object({ id: z.string().uuid(), slug: z.string(), name: z.string() });
const blogTagSchema = z.object({ id: z.string().uuid(), slug: z.string(), name: z.string() });
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
const blogTagBody = z.object({ name: z.string(), slug: z.string().optional() }).strict();
const blogTagPatch = z
  .object({ name: z.string().optional(), slug: z.string().optional() })
  .strict()
  .refine((input) => input.name !== undefined || input.slug !== undefined);

function categoryConflict(c: Parameters<typeof domainError>[0], error: unknown) {
  if (error instanceof BlogCategoryConflictError)
    return c.json({ error: error.message, code: `category_${error.field}_conflict` }, 409);
  if (error instanceof BlogCategoryNotFoundError)
    return c.json({ error: error.message, code: "not_found" }, 404);
  return domainError(c, error);
}

export function registerBlogRoutes(app: OpenAPIHono<Env>, container: ApplicationContainer) {
  const maxRows = crudMaxRows();
  const blogListQuery = z.object({
    search: z.string().max(100).optional(),
    status: z.enum(["draft", "published", "all"]).optional(),
    category: z.string().max(100).optional(),
    tag: z.string().max(100).optional(),
    sort: z
      .enum(["created", "title"])
      .default("created")
      .describe("Sort by creation date or title."),
    direction: z.enum(["asc", "desc"]).default("desc").describe("Sort direction."),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  });
  const blogAdminListQuery = blogListQuery.extend({
    limit: z.coerce.number().int().min(1).max(maxRows).default(maxRows),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/blog/posts",
      request: { query: blogAdminListQuery },
      responses: {
        200: {
          description:
            "Published posts by default; draft/all filters require content-management access.",
          content: { "application/json": { schema: blogPageSchema } },
        },
      },
    }),
    (c) => {
      try {
        const query = c.req.valid("query");
        const privileged = query.status === "draft" || query.status === "all";
        if (privileged) {
          const p = requirePrincipal(c);
          if (!(p instanceof Object) || !("accountId" in p)) return p;
          const denied = requireCapabilityScope(c, p, "content.manage", "blog:read");
          if (denied) return denied;
        }
        const page = container.blog.list({
          ...query,
          status: query.status === "all" ? undefined : query.status,
          publishedOnly: !privileged,
        });
        return c.json({ ...page, items: page.items.map(blogJson) }, 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/blog/posts/{postId}",
      request: { params: z.object({ postId: z.string().min(1).max(160) }) },
      responses: {
        200: {
          description: "Published blog post identified by its ID or slug.",
          content: { "application/json": { schema: blogPostSchema } },
        },
        404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
      },
    }),
    (c) => {
      const post = container.blog.get(c.req.valid("param").postId, true);
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
      tags: ["Blog Tags"],
      responses: {
        200: {
          description: "Blog tags",
          content: {
            "application/json": {
              schema: z.object({ items: z.array(blogTagSchema) }),
            },
          },
        },
      },
    }),
    (c) => c.json({ items: container.blog.tagService.list() }, 200),
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/blog/tags",
      tags: ["Blog Tags"],
      request: { body: { content: { "application/json": { schema: blogTagBody } } } },
      responses: {
        201: {
          description: "Blog tag created",
          content: { "application/json": { schema: blogTagSchema } },
        },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:write");
      if (denied) return denied;
      try {
        return c.json(container.blog.tagService.create(c.req.valid("json")), 201);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/blog/tags/{tagId}",
      tags: ["Blog Tags"],
      request: { params: z.object({ tagId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Blog tag",
          content: { "application/json": { schema: blogTagSchema } },
        },
        404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:read");
      if (denied) return denied;
      const result = container.blog.tagService.get(c.req.valid("param").tagId);
      return result
        ? c.json(result, 200)
        : c.json({ error: "Blog tag not found", code: "not_found" }, 404);
    },
  );
  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/blog/tags/{tagId}",
      tags: ["Blog Tags"],
      request: {
        params: z.object({ tagId: z.string().uuid() }),
        body: { content: { "application/json": { schema: blogTagPatch } } },
      },
      responses: {
        200: {
          description: "Blog tag updated",
          content: { "application/json": { schema: blogTagSchema } },
        },
        404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:write");
      if (denied) return denied;
      try {
        const result = container.blog.tagService.update(
          c.req.valid("param").tagId,
          c.req.valid("json"),
        );
        return result
          ? c.json(result, 200)
          : c.json({ error: "Blog tag not found", code: "not_found" }, 404);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/blog/tags",
      tags: ["Blog Tags"],
      request: { body: { content: { "application/json": { schema: resourceDeleteSchema() } } } },
      responses: {
        200: {
          description: "Blog tag deletion results",
          content: {
            "application/json": {
              schema: z.object({
                results: z.array(
                  z.object({ id: z.uuid(), deleted: z.boolean(), error: z.string().nullable() }),
                ),
              }),
            },
          },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:write");
      if (denied) return denied;
      const { ids } = c.req.valid("json");
      return c.json(
        await deleteResourceIds(ids, (id) => container.blog.tagService.delete(id)),
        200,
      );
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/blog/categories",
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
        return c.json(container.blog.categoryService.create(name, slug), 201);
      } catch (error) {
        return categoryConflict(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/blog/categories/{categoryId}",
      request: { params: z.object({ categoryId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Blog category",
          content: { "application/json": { schema: blogCategorySchema } },
        },
        403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
        404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
        409: {
          description: "Category conflict",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:read");
      if (denied) return denied;
      try {
        return c.json(container.blog.categoryService.get(c.req.valid("param").categoryId), 200);
      } catch (error) {
        return categoryConflict(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/blog/categories/{categoryId}",
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
          container.blog.categoryService.update(
            c.req.valid("param").categoryId,
            c.req.valid("json"),
          ),
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
      path: "/api/blog/categories",
      request: { body: { content: { "application/json": { schema: resourceDeleteSchema() } } } },
      responses: {
        200: {
          description: "Per-category deletion results",
          content: {
            "application/json": {
              schema: z.object({
                results: z.array(
                  z.object({
                    id: z.string().uuid(),
                    deleted: z.boolean(),
                    error: z.string().nullable(),
                  }),
                ),
              }),
            },
          },
        },
        400: {
          description: "Invalid IDs",
          content: { "application/json": { schema: errorSchema } },
        },
        403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:manage");
      if (denied) return denied;
      try {
        const { ids } = c.req.valid("json");
        return c.json(
          await deleteResourceIds(ids, (id) => container.blog.categoryService.delete(id)),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
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
      path: "/api/blog/posts/{postId}",
      request: {
        params: z.object({ postId: z.string().uuid() }),
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
        const current = container.blog.get(c.req.valid("param").postId);
        if ((body.status ?? current?.status) === "published") {
          const publishDenied = requireCapabilityScope(c, p, "content.manage", "blog:publish");
          if (publishDenied) return publishDenied;
        }
        return c.json(
          operatorBlogJson(container.blog.update(c.req.valid("param").postId, body, p.accountId)),
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
      path: "/api/blog/posts",
      request: { body: { content: { "application/json": { schema: resourceDeleteSchema() } } } },
      responses: {
        200: {
          description: "Per-article deletion results",
          content: {
            "application/json": {
              schema: z.object({
                results: z.array(
                  z.object({
                    id: z.string().uuid(),
                    deleted: z.boolean(),
                    error: z.string().nullable(),
                  }),
                ),
              }),
            },
          },
        },
        400: {
          description: "Invalid IDs",
          content: { "application/json": { schema: errorSchema } },
        },
        403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
        404: {
          description: "Article not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "content.manage", "blog:manage");
      if (denied) return denied;
      try {
        const { ids } = c.req.valid("json");
        return c.json(await deleteResourceIds(ids, (id) => container.blog.delete(id)), 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
