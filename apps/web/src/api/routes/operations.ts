import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { registerAccountManagementRoutes } from "./accounts/management";
import { registerAccountCapabilityRoutes } from "./accounts/capabilities";
import { registerFundingOperationsRoutes } from "./funding-operations";
import type { Env } from "../shared/context";

/** Composition boundary for cross-resource account and funding operations. */
export function registerAccountAndFundingRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  registerAccountManagementRoutes(app, container);
  registerAccountCapabilityRoutes(app, container);
  registerFundingOperationsRoutes(app, container);
}
