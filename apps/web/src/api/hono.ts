import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { dispatchLegacyApi, legacyApiPaths } from "./legacy-dispatch";
import { applyOpenApiMetadata } from "./openapi/metadata";
import type { OpenApiDocument } from "./openapi/metadata";
import {
  canReadOpenApiSchema,
  loadOpenApiSchemaAccess,
  type OpenApiSchemaAccess,
} from "@/security/openapi";
import type { Env } from "./shared/context";
import { domainError } from "./shared/error";
import { errorSchema } from "./shared/schemas";
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
import { registerPackageEntitlementRoutes } from "./routes/package/entitlements";
import { accountAccessOpenApiMetadata } from "./routes/account-access/metadata";
import { blogOpenApiMetadata } from "./routes/blog/metadata";
import { hierarchyOpenApiMetadata } from "./routes/hierarchy/metadata";
import { operatorAccountsOpenApiMetadata } from "./routes/operator/accounts/metadata";
import { operatorFinanceOpenApiMetadata } from "./routes/operator/finance/metadata";
import { operatorFundingOpenApiMetadata } from "./routes/operator/funding/metadata";
import { operatorTreasuryOpenApiMetadata } from "./routes/operator/treasury/metadata";
import { operatorWithdrawalOpenApiMetadata } from "./routes/operator/withdrawal/metadata";

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
        return c.json({ error: "Not found", code: "not_found" }, 404) as never;
      const document = app.getOpenAPIDocument({
        openapi: "3.0.0",
        info: { title: "Cliqero API", version: "1.0.0" },
        servers: [{ url: "/" }],
      }) as unknown as OpenApiDocument;
      applyOpenApiMetadata(document, legacyApiPaths, [
        accountAccessOpenApiMetadata,
        blogOpenApiMetadata,
        hierarchyOpenApiMetadata,
        operatorAccountsOpenApiMetadata,
        operatorFinanceOpenApiMetadata,
        operatorFundingOpenApiMetadata,
        operatorTreasuryOpenApiMetadata,
        operatorWithdrawalOpenApiMetadata,
      ]);
      delete document.paths["/api/openapi.json"];
      return c.json(document, 200) as never;
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
  registerPackageEntitlementRoutes(app, container);

  // Compatibility handlers are internal adapters around the same application
  // services. This fallback keeps one authoritative HTTP router while legacy
  // Request/Response contracts remain available to existing clients.
  app.all("/api/*", async (c) => {
    const response = await dispatchLegacyApi(c.req.raw, c.get("principal"));
    return response ?? c.json({ error: "Not found", code: "not_found" }, 404);
  });
  return app;
}
