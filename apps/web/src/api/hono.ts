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
import { registerAccountAndFundingRoutes } from "./routes/operations";
import { registerCatalogueCategoryRoutes } from "./routes/catalogue/categories";
import { registerFinanceRoutes } from "./routes/finance";
import { registerWithdrawalRoutes } from "./routes/withdrawals";
import { registerTreasuryRoutes } from "./routes/treasury";
import { registerPaymentRoutes } from "./routes/payments";
import { registerHierarchyRoutes } from "./routes/hierarchy";
import { registerFundingRoutes } from "./routes/funding";
import { registerPaymentCallbackRoutes } from "./routes/payment-callbacks";
import { registerReviewRoutes } from "./routes/reviews";
import { registerAccountAccessRoutes } from "./routes/account-access";
import { registerPackageEntitlementRoutes } from "./routes/package/entitlements";
import { accountAccessOpenApiMetadata } from "./routes/account-access/metadata";
import { blogOpenApiMetadata } from "./routes/blog/metadata";
import { hierarchyOpenApiMetadata } from "./routes/hierarchy/metadata";
import { accountsOpenApiMetadata } from "./routes/accounts/management/metadata";
import { financeOpenApiMetadata } from "./routes/finance/metadata";
import { fundingOperationsOpenApiMetadata } from "./routes/funding-operations/metadata";
import { treasuryOpenApiMetadata } from "./routes/treasury/metadata";
import { withdrawalOpenApiMetadata } from "./routes/withdrawals/metadata";
import { operatorReviewOpenApiMetadata } from "./routes/reviews/metadata";
import { catalogueOpenApiMetadata } from "./routes/catalogue/metadata";
import { paymentsOpenApiMetadata } from "./routes/payments/metadata";

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
      return c.json(generateOpenApiDocument(app), 200) as never;
    },
  );
  registerBlogRoutes(app, container);
  registerAccountAndFundingRoutes(app, container);
  registerCatalogueCategoryRoutes(app, container);
  registerFinanceRoutes(app, container);
  registerWithdrawalRoutes(app, container);
  registerTreasuryRoutes(app, container);
  registerPaymentRoutes(app, container);
  registerHierarchyRoutes(app, container);
  registerReviewRoutes(app, container);
  registerFundingRoutes(app, container);
  registerPaymentCallbackRoutes(app, container);
  registerAccountAccessRoutes(app, container);
  registerPackageEntitlementRoutes(app, container);

  // Compatibility handlers are internal adapters around the same application
  // services. This fallback keeps one authoritative HTTP router while legacy
  // Request/Response contracts remain available to existing clients.
  app.all("/api/*", async (c) => {
    const response = await dispatchLegacyApi(c.req.raw, c.get("principal"), container);
    return response ?? c.json({ error: "Not found", code: "not_found" }, 404);
  });
  return app;
}

/** Builds the only Cliqero OpenAPI specification consumed by JSON and Swagger. */
export function generateOpenApiDocument(app: OpenAPIHono<Env>) {
  const document = app.getOpenAPIDocument({
    openapi: "3.0.0",
    info: { title: "Cliqero API", version: "1.0.0" },
    servers: [{ url: "/" }],
  }) as unknown as OpenApiDocument;
  applyOpenApiMetadata(document, legacyApiPaths, [
    accountAccessOpenApiMetadata,
    blogOpenApiMetadata,
    hierarchyOpenApiMetadata,
    accountsOpenApiMetadata,
    financeOpenApiMetadata,
    fundingOperationsOpenApiMetadata,
    treasuryOpenApiMetadata,
    withdrawalOpenApiMetadata,
    operatorReviewOpenApiMetadata,
    catalogueOpenApiMetadata,
    paymentsOpenApiMetadata,
  ]);
  delete document.paths["/api/openapi.json"];
  return document;
}
