import { z } from "zod";
import { apiError, authenticatedAccount, authenticatedPrincipal } from "../http";
import { getContainer } from "@/infrastructure/container";
import { listingWithMediaView } from "@/application/listing/service";
import { loadStorefrontConfiguration } from "@/config/storefront";
import { isAuthenticatedPrincipal } from "@/modules/identity/api/principal";
import { apiAuthorizer } from "@/api/shared/authorization";
import { crudMaxRows } from "@/config/crud";

const sorts = ["date", "price", "title", "rating"] as const;
const directions = ["asc", "desc"] as const;

const listingSchema = z
  .object({
    title: z.string().min(1),
    short_description: z.string().max(200).default(""),
    long_description: z.string().default(""),
    price_minor: z.string().regex(/^\d+$/),
    currency: z.string().length(3),
    destination: z.url(),
    metadata: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional(),
    external_key: z.string().max(128).optional(),
    featured_position: z.number().int().positive().nullable().optional(),
    state: z.enum(["draft", "published", "archived"]).optional(),
    compare_at_price_minor: z.string().regex(/^\d+$/).nullable().optional(),
    visibility: z.enum(["public", "authenticated"]).optional(),
    category_ids: z
      .array(z.uuid())
      .max(30)
      .refine((ids) => new Set(ids).size === ids.length, "Category IDs must be unique")
      .optional(),
  })
  .strict();
export async function POST(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await getContainer().operators.requireCapability(account.id, "catalogue.manage");
    const body = listingSchema.parse(await request.json());
    const listing = await getContainer().listingService.createCatalogue(account, {
      title: body.title,
      shortDescription: body.short_description,
      longDescription: body.long_description,
      priceMinor: body.price_minor,
      currency: body.currency,
      destination: body.destination,
      metadata: body.metadata,
      externalKey: body.external_key,
      featuredPosition: body.featured_position,
      state: body.state,
      compareAtPriceMinor: body.compare_at_price_minor,
      visibility: body.visibility,
      categoryIds: body.category_ids,
    });
    return Response.json(
      (await import("@/application/listing/service")).ownerListingView(listing),
      {
        status: 201,
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function GET(
  request: Request,
  context?: { container?: ReturnType<typeof getContainer> },
) {
  const c = context?.container ?? getContainer();
  const url = new URL(request.url);
  const principal = await authenticatedPrincipal(request, c);
  const storefrontConfig = loadStorefrontConfiguration();
  const configuredLimit =
    url.searchParams.get("featured") === "true"
      ? storefrontConfig.home.featured_limit
      : storefrontConfig.catalogue.page_size;
  const stateFilter = url.searchParams.get("state") ?? undefined;
  if (stateFilter) {
    const denied = apiAuthorizer.authorize(
      principal,
      {
        mode: "account",
        capability: "catalogue.manage",
        scope: "catalogue:manage",
      },
      request.headers.has("authorization"),
    );
    if (denied)
      return Response.json(
        { error: denied === "unauthorized" ? "Unauthorized" : "Forbidden", code: denied },
        { status: denied === "unauthorized" ? 401 : 403 },
      );
  }
  const featuredOnly = url.searchParams.get("featured") === "true";
  try {
    const listingQuery = z.object({
      state: z.enum(["draft", "published", "archived", "all"]).optional(),
      visibility: z.enum(["public", "authenticated"]).optional(),
      search: z.string().max(200).optional(),
      cursor: z.string().optional(),
      sort: z.enum(sorts).default("date"),
      direction: z.enum(directions).default("desc"),
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(stateFilter ? crudMaxRows() : configuredLimit)
        .default(stateFilter ? crudMaxRows() : configuredLimit),
    });
    const query = listingQuery.parse({
      state: stateFilter,
      visibility: url.searchParams.get("visibility") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
      direction: url.searchParams.get("direction") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (stateFilter) {
      const page = await c.listingService.queryCatalogue({
        state: query.state === "all" ? undefined : query.state,
        visibility: query.visibility,
        search: query.search,
        sort: query.sort,
        direction: query.direction,
        cursor: query.cursor,
        limit: query.limit,
      });
      const media = await c.listingMediaRepository.listByListings(
        page.items.map((item) => item.id),
      );
      return Response.json({
        items: page.items.map((item) =>
          listingWithMediaView(item, media.get(item.id) ?? [], c.listingMedia, true),
        ),
        next_cursor: page.nextCursor,
      });
    }
    const requestedLimit = Number(url.searchParams.get("limit") ?? configuredLimit);
    const limit = Math.max(
      1,
      Math.min(Number.isFinite(requestedLimit) ? requestedLimit : configuredLimit, configuredLimit),
    );
    const page = await c.listingService.queryStorefront(
      isAuthenticatedPrincipal(principal) ? { kind: "authenticated" } : { kind: "anonymous" },
      {
        search: query.search,
        cursor: query.cursor,
        limit: Math.min(query.limit, limit),
        sort: query.sort,
        direction: query.direction,
        featuredOnly,
      },
    );
    const media = await c.listingMediaRepository.listByListings(page.items.map((item) => item.id));
    const ratings = await c.listingReviews.summariesForListings(page.items.map((item) => item.id));
    return Response.json(
      {
        items: page.items.map((item) =>
          listingWithMediaView(
            item,
            media.get(item.id) ?? [],
            c.listingMedia,
            false,
            ratings.get(item.id) ?? null,
          ),
        ),
        next_cursor: page.nextCursor,
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
