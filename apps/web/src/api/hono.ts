import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { dispatchLegacyApi, legacyApiPaths } from "./legacy-dispatch";
import {
  canReadOpenApiSchema,
  loadOpenApiSchemaAccess,
  type OpenApiSchemaAccess,
} from "@/security/openapi";
import * as routeContracts from "./routes/contracts";
import type { Env } from "./routes/contracts";
import { registerBlogRoutes } from "./routes/blog";
import { registerOperatorOperationsRoutes } from "./routes/operator/operations";
import { registerOperatorFinanceRoutes } from "./routes/operator/finance";
import { registerOperatorWithdrawalRoutes } from "./routes/operator/withdrawal";
import { registerOperatorTreasuryRoutes } from "./routes/operator/treasury";
import { registerHierarchyRoutes } from "./routes/hierarchy";
import { registerApiKeyRoutes } from "./routes/api-keys";
import { registerFundingRoutes } from "./routes/funding";
import { registerPaymentCallbackRoutes } from "./routes/payment-callbacks";
import { registerReviewRoutes } from "./routes/reviews";
import { registerAccountAccessRoutes } from "./routes/account-access";

const { errorSchema, domainError } = routeContracts;

export function createApiApp(
  container: ApplicationContainer,
  schemaAccess: OpenApiSchemaAccess = loadOpenApiSchemaAccess(),
) {
  const app = new OpenAPIHono<Env>();
  app.onError((error, c) => domainError(c, error));
  app.use("/api/*", async (c, next) => {
    const p = await container.principalResolver.resolve(c.req.raw);
    c.set("principal", p);
    await next();
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/openapi.json",
      responses: {
        200: {
          description: "OpenAPI document",
          content: { "application/json": { schema: z.any() } },
        },
        404: {
          description: "Not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    (c) => {
      if (!canReadOpenApiSchema(schemaAccess, c.req.header("x-openapi-key")))
        return c.json({ error: "Not found", code: "not_found" }, 404);
      const document = app.getOpenAPIDocument({
        openapi: "3.0.0",
        info: { title: "Cliqero API", version: "1.0.0" },
        servers: [{ url: "/" }],
      }) as any;
      const response = {
        description: "Application API response",
        content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
      };
      const errorResponse = {
        description: "Request error",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { error: { type: "string" }, code: { type: "string" } },
              required: ["error"],
            },
          },
        },
      };
      for (const route of legacyApiPaths) {
        const path = (document.paths[route.path] ??= {});
        for (const routeMethod of route.methods) {
          const operation = routeMethod.method.toLowerCase();
          path[operation] ??= {
            "x-authentication-mode": routeMethod.access.mode,
            ...(routeMethod.access.scope
              ? { "x-required-api-scope": routeMethod.access.scope }
              : {}),
            responses: {
              "200": response,
              "400": errorResponse,
              "401": errorResponse,
              "403": errorResponse,
              "404": errorResponse,
            },
          };
        }
      }
      const overview = document.paths["/api/operator/overview"]?.get;
      if (overview) {
        overview["x-authentication-mode"] = "account";
        overview["x-required-api-scope"] = "operations:manage";
      }
      for (const path of ["/api/operator/accounts", "/api/operator/accounts/{accountId}"]) {
        const operation = document.paths[path]?.get;
        if (operation) {
          operation["x-authentication-mode"] = "account";
          operation["x-required-api-scope"] = "operations:manage";
        }
      }
      for (const path of ["/api/operator/funding", "/api/operator/funding/{fundingId}"]) {
        const operation = document.paths[path]?.get;
        if (operation) {
          operation["x-authentication-mode"] = "account";
          operation["x-required-api-scope"] = "operations:manage";
        }
      }
      for (const path of [
        "/api/operator/distributions",
        "/api/operator/distributions/{distributionId}",
        "/api/operator/earnings",
      ]) {
        const operation = document.paths[path]?.get;
        if (operation) {
          operation["x-authentication-mode"] = "account";
          operation["x-required-api-scope"] = "operations:manage";
        }
      }
      for (const path of [
        "/api/operator/blog",
        "/api/blog/posts",
        "/api/blog/posts/{id}",
        "/api/blog/posts/{id}/publish",
        "/api/blog/posts/{id}/unpublish",
      ]) {
        const pathItem = document.paths[path];
        if (pathItem)
          for (const [method, operation] of Object.entries(pathItem) as any[])
            if (operation && typeof operation === "object") {
              operation["x-authentication-mode"] =
                path === "/api/blog/posts" && method === "get" ? "public" : "account";
              operation["x-required-api-scope"] =
                method === "post" && path.endsWith("publish")
                  ? "blog:publish"
                  : method === "delete"
                    ? "blog:manage"
                    : method === "patch" || method === "post"
                      ? "blog:write"
                      : "blog:read";
            }
      }
      for (const path of [
        "/api/operator/withdrawals",
        "/api/operator/withdrawals/{withdrawalId}",
        "/api/operator/withdrawals/{withdrawalId}/approve",
        "/api/operator/withdrawals/{withdrawalId}/reject",
        "/api/operator/withdrawals/{withdrawalId}/payout",
        "/api/operator/withdrawals/{withdrawalId}/payout/reconcile",
        "/api/operator/withdrawals/{withdrawalId}/complete",
      ]) {
        const pathItem = document.paths[path];
        if (pathItem)
          for (const operation of Object.values(pathItem) as any[]) {
            if (operation && typeof operation === "object") {
              operation["x-authentication-mode"] = "account";
              operation["x-required-api-scope"] = "withdrawals:manage";
            }
          }
      }
      for (const [path, method] of [
        ["/api/operator/treasury", "get"],
        ["/api/operator/treasury/entries", "get"],
        ["/api/operator/treasury/entries/{entryId}", "get"],
        ["/api/operator/treasury/entries", "post"],
      ] as const) {
        const operation = document.paths[path]?.[method];
        if (operation) {
          operation["x-authentication-mode"] = "account";
          operation["x-required-api-scope"] =
            method === "post" ? "treasury:manage" : "treasury:read";
        }
      }
      const access = document.paths["/api/me/access"]?.get;
      if (access) access["x-authentication-mode"] = "account";
      return c.json(document);
    },
  );
  registerBlogRoutes(app, container);
  registerOperatorOperationsRoutes(app, container);
  registerOperatorFinanceRoutes(app, container);
  registerOperatorWithdrawalRoutes(app, container);
  registerOperatorTreasuryRoutes(app, container);
  registerHierarchyRoutes(app, container);
  registerApiKeyRoutes(app, container);
  registerReviewRoutes(app, container);
  registerFundingRoutes(app, container);
  registerPaymentCallbackRoutes(app, container);
  registerAccountAccessRoutes(app, container);

  // Compatibility handlers are internal adapters around the same application
  // services. This fallback keeps one authoritative HTTP router while legacy
  // Request/Response contracts remain available to existing clients.
  app.all("/api/*", async (c) => {
    const response = await dispatchLegacyApi(c.req.raw, c.get("principal"));
    return response ?? c.json({ error: "Not found", code: "not_found" }, 404);
  });
  return app;
}
