import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApplicationContainer } from "@/infrastructure/container";
import { requireCapabilityScope, requirePrincipal, type Env } from "../../shared/context";
import { reviewJson } from "./serialization";
import { errorSchema } from "../../shared/schemas";
import { reviewPageSchema, reviewResponseSchema } from "./contracts";

export function registerReviewRoutes(app: OpenAPIHono<Env>, container: ApplicationContainer) {
  app.get("/api/listings/:listingId/reviews", async (c) => {
    const listingId = c.req.param("listingId");
    if (!z.uuid().safeParse(listingId).success)
      return c.json({ error: "Listing not found", code: "not_found" }, 404);
    const requested = Number(c.req.query("limit") ?? 10);
    const caller = c.get("principal");
    const accountId = caller.kind === "anonymous" ? undefined : caller.account?.id;
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
    const review = await container.listingReviews.create(p.account, c.req.param("listingId"), body);
    return c.json({ item: reviewJson(review, { reviewer: p.account.username, isMine: true }) });
  });

  const operatorReviewQuery = z.object({
    status: z.enum(["pending", "approved", "rejected"]).optional(),
    listing_id: z.uuid().optional(),
    sort: z
      .enum(["submitted", "rating"])
      .default("submitted")
      .describe("Sort by submission time or rating."),
    direction: z.enum(["asc", "desc"]).default("desc").describe("Sort direction."),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(100),
  });
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/reviews",
      tags: ["Reviews"],
      summary: "List reviews for moderation",
      request: { query: operatorReviewQuery },
      responses: {
        200: {
          description: "Moderation queue",
          content: {
            "application/json": {
              schema: reviewPageSchema,
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Review moderation permission required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p as never;
      const denied = requireCapabilityScope(c, p, "reviews.moderate", "reviews:moderate");
      if (denied) return denied as never;
      const query = c.req.valid("query");
      const page = await container.listingReviews.operatorQueue(p.account, {
        ...query,
        listingId: query.listing_id,
      });
      return c.json(
        {
          items: page.items.map((review) => reviewJson(review)),
          next_cursor: page.nextCursor,
        },
        200,
      );
    },
  );

  app.get("/api/reviews/:reviewId", async (c) => {
    const p = requirePrincipal(c);
    if (!(p instanceof Object) || !("accountId" in p)) return p;
    const denied = requireCapabilityScope(c, p, "reviews.moderate", "reviews:moderate");
    if (denied) return denied;
    try {
      return c.json({
        item: reviewJson(await container.listingReviews.get(p.account, c.req.param("reviewId"))),
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Review not found" }, 404);
    }
  });

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/reviews/{reviewId}",
      tags: ["Reviews"],
      summary: "Moderate a review",
      description:
        "Changes a pending review to approved or rejected. The review service rejects unsupported transitions.",
      request: {
        params: z.object({ reviewId: z.uuid().describe("ID of the review to moderate.") }),
        body: {
          content: {
            "application/json": {
              schema: z
                .object({
                  rating: z.number().int().min(1).max(5).optional(),
                  body: z.string().max(2000).optional(),
                  status: z.enum(["pending", "approved", "rejected"]).optional(),
                })
                .strict()
                .refine((value) => Object.keys(value).length > 0),
            },
          },
        },
      },
      responses: {
        200: {
          description: "Review moderation state updated",
          content: { "application/json": { schema: z.object({ item: reviewResponseSchema }) } },
        },
        400: {
          description: "Invalid moderation status",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        403: {
          description: "Review moderation permission required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Review not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "Review is not pending",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const p = requirePrincipal(c);
      if (!(p instanceof Object) || !("accountId" in p)) return p;
      const denied = requireCapabilityScope(c, p, "reviews.moderate", "reviews:moderate");
      if (denied) return denied;
      const review = await container.listingReviews.update(
        p.account,
        c.req.valid("param").reviewId,
        c.req.valid("json"),
      );
      return c.json({ item: reviewJson(review) }, 200);
    },
  );

  app.delete("/api/reviews/:reviewId", async (c) => {
    const p = requirePrincipal(c);
    if (!(p instanceof Object) || !("accountId" in p)) return p;
    const denied = requireCapabilityScope(c, p, "reviews.moderate", "reviews:moderate");
    if (denied) return denied;
    try {
      await container.listingReviews.delete(p.account, c.req.param("reviewId"));
      return c.body(null, 204);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Review not found" }, 404);
    }
  });
}
