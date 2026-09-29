import { z } from "zod";
import { apiError, authenticatedAccount } from "../http";
import { getContainer } from "@/infrastructure/container";
import { listingWithMediaView } from "@/application/listing/service";
import { loadStorefrontConfiguration } from "@/config/storefront";

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
    const listing = await getContainer().listingService.create(account, {
      title: body.title,
      shortDescription: body.short_description,
      longDescription: body.long_description,
      priceMinor: body.price_minor,
      currency: body.currency,
      destination: body.destination,
      metadata: body.metadata,
      externalKey: body.external_key,
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
export async function GET(request: Request) {
  const c = getContainer();
  const url = new URL(request.url);
  const featuredOnly = url.searchParams.get("featured") === "true";
  const sort = sorts.includes(url.searchParams.get("sort") as (typeof sorts)[number])
    ? (url.searchParams.get("sort") as (typeof sorts)[number])
    : "date";
  const direction = directions.includes(
    url.searchParams.get("direction") as (typeof directions)[number],
  )
    ? (url.searchParams.get("direction") as (typeof directions)[number])
    : "desc";
  try {
    const principal = await c.principalResolver.resolve(request);
    const storefrontConfig = loadStorefrontConfiguration();
    const configuredLimit = featuredOnly
      ? storefrontConfig.home.featured_limit
      : storefrontConfig.catalogue.page_size;
    const requestedLimit = Number(url.searchParams.get("limit") ?? configuredLimit);
    const limit = Math.max(
      1,
      Math.min(Number.isFinite(requestedLimit) ? requestedLimit : configuredLimit, configuredLimit),
    );
    const page = await c.listingService.queryStorefront(
      principal ? { kind: "authenticated" } : { kind: "anonymous" },
      {
        search: url.searchParams.get("search") ?? undefined,
        cursor: url.searchParams.get("cursor") ?? undefined,
        limit,
        sort,
        direction,
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
