import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import type { Env } from "../../shared/context";
import { requireCapabilityScope, requirePrincipal } from "../../shared/context";
import { domainError } from "../../shared/error";
import { errorSchema } from "../../shared/schemas";
import {
  ListingCategoryConflictError,
  ListingCategoryInUseError,
  ListingCategoryNotFoundError,
  listingCategoryIdSchema,
  listingCategoryNameSchema,
} from "@/modules/listing/category/category";
import { deleteResourceIds, resourceDeleteSchema } from "../../shared/resource-delete";

const categorySchema = z.object({ id: z.string().uuid(), name: z.string(), slug: z.string() });
const createSchema = z
  .object({ name: listingCategoryNameSchema, slug: z.string().optional() })
  .strict();
const patchSchema = z
  .object({ name: listingCategoryNameSchema.optional(), slug: z.string().optional() })
  .strict()
  .refine(
    (value) => value.name !== undefined || value.slug !== undefined,
    "Provide a name or slug.",
  );
const categoryId = z.object({ categoryId: listingCategoryIdSchema });

function respondError(c: Parameters<typeof domainError>[0], error: unknown) {
  if (error instanceof ListingCategoryConflictError)
    return c.json({ error: error.message, code: `category_${error.field}_conflict` }, 409);
  if (error instanceof ListingCategoryInUseError)
    return c.json({ error: error.message, code: "category_in_use" }, 409);
  if (error instanceof ListingCategoryNotFoundError)
    return c.json({ error: error.message, code: "not_found" }, 404);
  return domainError(c, error);
}

export function registerCatalogueCategoryRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/catalogue/categories",
      tags: ["Catalogue"],
      summary: "List catalogue categories",
      description: "Returns categories available for public catalogue browsing.",
      responses: {
        200: {
          description: "Catalogue categories",
          content: { "application/json": { schema: z.object({ items: z.array(categorySchema) }) } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Catalogue management permission required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    (c) => container.listingCategories.list().then((items) => c.json({ items: [...items] }, 200)),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/catalogue/categories",
      request: { body: { content: { "application/json": { schema: createSchema } } } },
      responses: {
        201: {
          description: "Category created",
          content: { "application/json": { schema: categorySchema } },
        },
        400: {
          description: "Invalid category",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Name or slug conflict",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Not found",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Catalogue management permission required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const principal = requirePrincipal(c);
      if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
      const denied = requireCapabilityScope(c, principal, "catalogue.manage", "catalogue:manage");
      if (denied) return denied;
      try {
        const body = c.req.valid("json");
        return c.json(await container.listingCategories.create(body.name, body.slug), 201);
      } catch (error) {
        return respondError(c, error);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/catalogue/categories/{categoryId}",
      request: { params: categoryId },
      responses: {
        200: {
          description: "Catalogue category",
          content: { "application/json": { schema: categorySchema } },
        },
        404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Catalogue management permission required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const principal = requirePrincipal(c);
      if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
      const denied = requireCapabilityScope(c, principal, "catalogue.manage", "catalogue:manage");
      if (denied) return denied;
      try {
        return c.json(await container.listingCategories.get(c.req.valid("param").categoryId), 200);
      } catch (error) {
        if (error instanceof ListingCategoryNotFoundError)
          return c.json({ error: error.message, code: "not_found" }, 404);
        return domainError(c, error);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/catalogue/categories/{categoryId}",
      request: {
        params: categoryId,
        body: { content: { "application/json": { schema: patchSchema } } },
      },
      responses: {
        200: {
          description: "Category updated",
          content: { "application/json": { schema: categorySchema } },
        },
        404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
        409: {
          description: "Name or slug conflict",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Catalogue management permission required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const principal = requirePrincipal(c);
      if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
      const denied = requireCapabilityScope(c, principal, "catalogue.manage", "catalogue:manage");
      if (denied) return denied;
      try {
        return c.json(
          await container.listingCategories.update(
            c.req.valid("param").categoryId,
            c.req.valid("json"),
          ),
          200,
        );
      } catch (error) {
        return respondError(c, error);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/catalogue/categories",
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
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Catalogue management permission required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "A category was not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "A category is still assigned",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const principal = requirePrincipal(c);
      if (!(principal instanceof Object) || !("accountId" in principal)) return principal;
      const denied = requireCapabilityScope(c, principal, "catalogue.manage", "catalogue:manage");
      if (denied) return denied;
      try {
        const { ids } = c.req.valid("json");
        return c.json(
          await deleteResourceIds(ids, (id) => container.listingCategories.delete(id)),
          200,
        );
      } catch (error) {
        return respondError(c, error);
      }
    },
  );
}
