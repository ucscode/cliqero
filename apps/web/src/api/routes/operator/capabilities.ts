import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import * as routeContracts from "../contracts";
import type { Env } from "../contracts";

export function registerOperatorCapabilityRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  const {
    errorSchema,
    capabilityAdministrationSchema,
    requirePrincipal,
    requireSessionCapability,
    domainError,
  } = routeContracts;
  const capabilityParams = z.object({ accountId: z.string().uuid() });
  const capabilityBody = z.object({ capability: z.string().min(1).max(64) }).strict();
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/accounts/{accountId}/capabilities",
      request: { params: capabilityParams },
      responses: {
        200: {
          description: "Direct capability assignments",
          content: { "application/json": { schema: capabilityAdministrationSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Capability administration access required",
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
      const denied = requireSessionCapability(c, p, "capabilities.manage");
      if (denied) return denied;
      try {
        return c.json(
          await container.capabilityAdministration.inspect(
            p.accountId,
            c.req.valid("param").accountId,
          ),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/operator/accounts/{accountId}/capabilities",
      request: {
        params: capabilityParams,
        body: { content: { "application/json": { schema: capabilityBody } } },
      },
      responses: {
        200: {
          description: "Capability grant result",
          content: {
            "application/json": {
              schema: z.object({
                accountId: z.string().uuid(),
                capability: z.string(),
                changed: z.boolean(),
                assigned: z.boolean(),
                grantedAt: z.string().nullable(),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Capability administration access required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Account not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Capability conflict",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireSessionCapability(c, p, "capabilities.manage");
      if (denied) return denied;
      try {
        return c.json(
          await container.capabilityAdministration.grant(
            p.accountId,
            c.req.valid("param").accountId,
            c.req.valid("json").capability,
          ),
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
      path: "/api/operator/accounts/{accountId}/capabilities/{capability}",
      request: { params: capabilityParams.extend({ capability: z.string().min(1).max(64) }) },
      responses: {
        200: {
          description: "Capability revoke result",
          content: {
            "application/json": {
              schema: z.object({
                accountId: z.string().uuid(),
                capability: z.string(),
                changed: z.boolean(),
                assigned: z.boolean(),
                grantedAt: z.string().nullable(),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Capability administration access required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Account not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "The final root cannot be removed",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireSessionCapability(c, p, "capabilities.manage");
      if (denied) return denied;
      try {
        return c.json(
          await container.capabilityAdministration.revoke(
            p.accountId,
            c.req.valid("param").accountId,
            c.req.valid("param").capability,
          ),
          200,
        );
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
