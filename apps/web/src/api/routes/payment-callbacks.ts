import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import type { Env } from "../shared/context";

export function registerPaymentCallbackRoutes(
  app: OpenAPIHono<Env>,
  container: ApplicationContainer,
) {
  app.post("/api/payments/:provider/ipn", async (c) => {
    if (c.req.param("provider") !== "nowpayments")
      return c.json({ error: "Not found", code: "not_found" }, 404);
    const ingress = container.nowPaymentsIpn;
    if (!ingress)
      return c.json({ error: "Provider unavailable", code: "provider_unavailable" }, 503);
    const result = await ingress.ingest(
      new Uint8Array(await c.req.raw.arrayBuffer()),
      c.req.header("x-nowpayments-sig") ?? null,
    );
    if (result.status === 401) return c.json({ error: "Unauthorized", code: "unauthorized" }, 401);
    if (result.status === 400)
      return c.json({ error: "Invalid notification", code: "invalid_request" }, 400);
    if (result.status === 404) return c.json({ error: "Not found", code: "not_found" }, 404);
    if (result.status === 409)
      return c.json(
        { error: "Reference and transaction identity mismatch", code: "conflict" },
        409,
      );
    return result.status === 204 ? c.body(null, 204) : c.body(null, 202);
  });
}
