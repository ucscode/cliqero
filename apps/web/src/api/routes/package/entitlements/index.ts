import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { bearerCredential } from "@/modules/identity/authentication";
import type { Env } from "../../../shared/context";
import { domainError } from "../../../shared/error";
import { errorSchema } from "../../../shared/schemas";

const entitlementState = z.enum(["active", "consumed", "expired", "revoked"]);
const entitlementSchema = z.object({
  id: z.string().uuid(),
  listing_id: z.string().uuid(),
  state: entitlementState,
  expires_at: z.string().datetime().nullable(),
  access_available: z.boolean(),
});
const entitlementParams = z.object({ id: z.string().uuid() });
const entitlementPatch = z
  .object({
    state: entitlementState.optional(),
    expires_at: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one entitlement field is required",
  });

export function registerPackageEntitlementRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/package/entitlements/{id}",
      request: { params: entitlementParams },
      responses: {
        200: {
          description: "A listing-scoped package entitlement",
          content: { "application/json": { schema: entitlementSchema } },
        },
        401: {
          description: "Integration credential required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Entitlement not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const integration = await authenticateIntegration(c.req.raw, container);
      if (!integration)
        return c.json({ error: "Unauthorized", code: "unauthorized" }, 401) as never;
      try {
        const result = await container.packageEntitlements.get(
          integration,
          c.req.valid("param").id,
        );
        return c.json(result, 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/package/entitlements/{id}",
      request: {
        params: entitlementParams,
        body: { content: { "application/json": { schema: entitlementPatch } } },
      },
      responses: {
        200: {
          description: "The updated listing-scoped package entitlement",
          content: { "application/json": { schema: entitlementSchema } },
        },
        400: {
          description: "Invalid entitlement update",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Integration credential required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Entitlement not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Invalid entitlement state transition",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const integration = await authenticateIntegration(c.req.raw, container);
      if (!integration)
        return c.json({ error: "Unauthorized", code: "unauthorized" }, 401) as never;
      try {
        const body = c.req.valid("json");
        const result = await container.packageEntitlements.update(
          integration,
          c.req.valid("param").id,
          {
            ...(body.state !== undefined ? { state: body.state } : {}),
            ...(Object.hasOwn(body, "expires_at")
              ? { expiresAt: body.expires_at ? new Date(body.expires_at) : null }
              : {}),
          },
        );
        return c.json(result, 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}

async function authenticateIntegration(request: Request, container: ApplicationContainer) {
  const credential = bearerCredential(request);
  return credential ? container.integrations.authenticate(credential) : null;
}
