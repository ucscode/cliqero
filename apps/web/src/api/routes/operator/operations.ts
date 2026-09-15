import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { registerOperatorAccountRoutes } from "./accounts";
import { registerOperatorCapabilityRoutes } from "./capabilities";
import { registerOperatorFundingRoutes } from "./funding";
import type { Env } from "../../shared/context";

/** Composition boundary for operator operational route families. */
export function registerOperatorOperationsRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  registerOperatorAccountRoutes(app, container);
  registerOperatorCapabilityRoutes(app, container);
  registerOperatorFundingRoutes(app, container);
}
