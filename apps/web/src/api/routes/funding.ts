import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { requirePrincipal, type Env } from "../shared/context";

export function registerFundingRoutes(app: OpenAPIHono<Env>, container: ApplicationContainer) {
  app.get("/api/wallet/funding-methods", async (c) => {
    const p = requirePrincipal(c);
    if (!(p instanceof Object) || !("accountId" in p)) return p;
    if (!p.account.country)
      return c.json(
        { error: "Account country is required for funding", code: "country_required" },
        409,
      );
    const methods = container.providers
      .availableMethodsFor({ country: p.account.country })
      .map((method) => ({
        id: method.provider.name,
        display_name: method.provider.displayName,
        image_url: method.provider.imageUrl,
        description: method.provider.description,
        test_only: method.provider.environmentOnly ?? null,
        collection_currencies: method.collectionCurrencies,
        payment_currencies: method.paymentCurrencies,
        customer_action: method.customerActionLabel,
      }));
    return c.json({ methods }, 200);
  });
}
