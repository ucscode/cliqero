import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { requirePrincipal, requireSessionCapability, type Env } from "../../../shared/context";
import { domainError } from "../../../shared/error";
import { errorSchema } from "../../../shared/schemas";
import { capabilityAdministrationSchema, capabilityReplacementSchema } from "./contracts";
import { publicErrorPayload } from "@/api/error";

export function registerAccountCapabilityRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  const capabilityParams = z.object({ accountId: z.string().uuid() });
  const capabilityBody = z.object({ capability: z.string().min(1).max(64) }).strict();
  const capabilitySetBody = z
    .object({ capabilities: z.array(z.string().min(1).max(64)).max(64) })
    .strict();
  const capabilityDeleteBody = z
    .object({
      ids: z.array(z.string().trim().min(1).max(64)).min(1).max(64),
    })
    .strict()
    .superRefine(({ ids }, context) => {
      if (new Set(ids).size !== ids.length)
        context.addIssue({ code: "custom", path: ["ids"], message: "IDs must be unique." });
    });
  app.openapi(
    createRoute({
      method: "put",
      path: "/api/accounts/{accountId}/capabilities",
      request: {
        params: capabilityParams,
        body: { content: { "application/json": { schema: capabilitySetBody } } },
      },
      responses: {
        200: {
          description: "Ordinary capability selection applied",
          content: { "application/json": { schema: capabilityReplacementSchema } },
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
          await container.capabilityAdministration.replaceOrdinary(
            p.accountId,
            c.req.valid("param").accountId,
            c.req.valid("json").capabilities,
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
      method: "get",
      path: "/api/accounts/{accountId}/capabilities",
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
      path: "/api/accounts/{accountId}/capabilities",
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
      path: "/api/accounts/{accountId}/capabilities",
      request: {
        params: capabilityParams,
        body: { content: { "application/json": { schema: capabilityDeleteBody } } },
      },
      responses: {
        200: {
          description: "Per-capability revoke results",
          content: {
            "application/json": {
              schema: z.object({
                results: z.array(
                  z.object({
                    id: z.string(),
                    deleted: z.boolean(),
                    error: z.string().nullable(),
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
        const { ids } = c.req.valid("json");
        const results = [];
        for (const capability of ids) {
          try {
            const result = await container.capabilityAdministration.revoke(
              p.accountId,
              c.req.valid("param").accountId,
              capability,
            );
            results.push({ id: capability, deleted: result.changed, error: null });
          } catch (error) {
            results.push({
              id: capability,
              deleted: false,
              error: publicErrorPayload(error)?.payload.error ?? "Capability could not be revoked.",
            });
          }
        }
        return c.json({ results }, 200);
      } catch (error) {
        return domainError(c, error);
      }
    },
  );
}
