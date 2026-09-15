import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { canAccessOperator } from "@/modules/identity/capabilities";
import { requirePrincipal, type Env } from "../shared/context";
import { errorSchema } from "../shared/schemas";
import { accountAccessSchema } from "./account-access/contracts";

export function registerAccountAccessRoutes(
  app: OpenAPIHono<Env>,
  _container: ApplicationContainer,
) {
  void _container;
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/me/access",
      responses: {
        200: {
          description: "Current account capabilities and safe application access flags",
          content: { "application/json": { schema: accountAccessSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      return c.json(
        {
          accountId: p.accountId,
          capabilities: [...p.capabilities],
          canAccessOperator: canAccessOperator(p.capabilities),
        },
        200,
      );
    },
  );
}
