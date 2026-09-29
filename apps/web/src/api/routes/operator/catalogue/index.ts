import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { crudMaxRows } from "@/config/crud";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../../shared/context";
import { domainError } from "../../../shared/error";
import { errorSchema } from "../../../shared/schemas";

export function registerOperatorCatalogueRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  const bulkBody = z
    .object({
      action: z.enum(["publish", "archive", "restore"]),
      ids: z
        .array(z.string().uuid())
        .min(1)
        .max(crudMaxRows())
        .refine((ids) => new Set(ids).size === ids.length, "ids must be unique"),
    })
    .strict();

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/catalogue/bulk",
      request: { body: { content: { "application/json": { schema: bulkBody } } } },
      responses: {
        200: {
          description: "Per-listing lifecycle outcomes",
          content: {
            "application/json": {
              schema: z.object({
                results: z.array(
                  z.object({
                    id: z.string().uuid(),
                    success: z.boolean(),
                    error: z.string().optional(),
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
        const { action, ids } = c.req.valid("json");
        const results = await container.listingService.bulkCatalogueState(
          principal.account,
          action,
          ids,
        );
        return c.json({ results }, 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
