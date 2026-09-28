import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { loadOperatorTableConfiguration } from "@/config/operator-tables";
import { registerOperatorAccountRoutes } from "./accounts";
import { registerOperatorCapabilityRoutes } from "./capabilities";
import { registerOperatorFundingRoutes } from "./funding";
import type { Env } from "../../shared/context";

/** Composition boundary for operator operational route families. */
export function registerOperatorOperationsRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  const tableConfiguration = loadOperatorTableConfiguration().tables;
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/operator/table-config",
      responses: {
        200: {
          description: "Validated Operator table controls safe for client presentation",
          content: {
            "application/json": {
              schema: z.object({
                tables: z.object({
                  defaultPageSize: z.number().int().positive(),
                  maxPageSize: z.number().int().positive(),
                  pageSizeOptions: z.array(z.number().int().positive()),
                  maxBulkSelection: z.number().int().positive(),
                }),
              }),
            },
          },
        },
      },
    }),
    (c) =>
      c.json(
        {
          tables: {
            defaultPageSize: tableConfiguration.default_page_size,
            maxPageSize: tableConfiguration.max_page_size,
            pageSizeOptions: tableConfiguration.page_size_options,
            maxBulkSelection: tableConfiguration.max_bulk_selection,
          },
        },
        200,
      ),
  );
  registerOperatorAccountRoutes(app, container);
  registerOperatorCapabilityRoutes(app, container);
  registerOperatorFundingRoutes(app, container);
}
