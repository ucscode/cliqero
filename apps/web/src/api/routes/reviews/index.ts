import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../shared/context";
import { reviewJson } from "./serialization";

export function registerReviewRoutes(app: OpenAPIHono<Env>, container: ApplicationContainer) {
  app.get("/api/listings/:listingId/reviews", async (c) => {
    const listingId = c.req.param("listingId");
    if (!z.uuid().safeParse(listingId).success)
      return c.json({ error: "Listing not found", code: "not_found" }, 404);
    const requested = Number(c.req.query("limit") ?? 10);
    const accountId = c.get("principal")?.account.id;
    const page = await container.listingReviews.visible({
      listingId,
      accountId,
      cursor: c.req.query("cursor") || undefined,
      limit: Math.max(1, Math.min(Number.isFinite(requested) ? requested : 10, 50)),
    });
    return c.json({
      items: page.items.map((review) =>
        reviewJson(review, { isMine: review.accountId === accountId }),
      ),
      next_cursor: page.nextCursor,
    });
  });

  app.get("/api/listings/:listingId/reviews/me", async (c) => {
    const p = requirePrincipal(c);
    if (!(p instanceof Object) || !("accountId" in p)) return p;
    const review = await container.listingReviews.mine(p.account, c.req.param("listingId"));
    return c.json({ item: review ? reviewJson(review) : null });
  });

  app.put("/api/listings/:listingId/reviews/me", async (c) => {
    const p = requirePrincipal(c);
    if (!(p instanceof Object) || !("accountId" in p)) return p;
    const body = z
      .object({ rating: z.number().int().min(1).max(5), body: z.string().max(2000).optional() })
      .parse(await c.req.json());
    const review = await container.listingReviews.submit(p.account, c.req.param("listingId"), body);
    return c.json({ item: reviewJson(review, { reviewer: p.account.username, isMine: true }) });
  });

  app.get("/api/operator/reviews", async (c) => {
    const p = requirePrincipal(c);
    if (!(p instanceof Object) || !("accountId" in p)) return p;
    const denied = requireCapabilityScope(c, p, "reviews.moderate", "reviews:moderate");
    if (denied) return denied;
    const status = z
      .enum(["pending", "approved", "rejected"])
      .optional()
      .parse(c.req.query("status") || undefined);
    const page = await container.listingReviews.operatorQueue(p.account, {
      status,
      cursor: c.req.query("cursor") || undefined,
      limit: 25,
    });
    return c.json({
      items: page.items.map((review) => reviewJson(review)),
      next_cursor: page.nextCursor,
    });
  });

  for (const [verb, status] of [
    ["approve", "approved"],
    ["reject", "rejected"],
  ] as const) {
    app.post(`/api/operator/reviews/:reviewId/${verb}`, async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "reviews.moderate", "reviews:moderate");
      if (denied) return denied;
      const review = await container.listingReviews.moderate(
        p.account,
        c.req.param("reviewId"),
        status,
      );
      return c.json({ item: reviewJson(review) });
    });
  }
}
