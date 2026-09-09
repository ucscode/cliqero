import { z } from "zod";
import { apiError, authenticatedAccount } from "../http";
import { getContainer } from "@/infrastructure/container";
import { listingWithMediaView } from "@/application/listings";
import { storefrontConfig } from "@/config/storefront";

const sorts = ["newest", "oldest", "price_asc", "price_desc", "title_asc"] as const;

const listingSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().default(""),
    price_minor: z.string().regex(/^\d+$/),
    currency: z.string().length(3),
    destination: z.url(),
    metadata: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional(),
    external_key: z.string().max(128).optional(),
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
      description: body.description,
      priceMinor: body.price_minor,
      currency: body.currency,
      destination: body.destination,
      metadata: body.metadata,
      externalKey: body.external_key,
    });
    return Response.json((await import("@/application/listings")).ownerListingView(listing), {
      status: 201,
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function GET(request: Request) {
  const url = new URL(request.url);
  const featuredOnly = url.searchParams.get("featured") === "true";
  const configuredLimit = featuredOnly
    ? storefrontConfig.home.featured_limit
    : storefrontConfig.catalogue.page_size;
  const requestedLimit = Number(url.searchParams.get("limit") ?? configuredLimit);
  const limit = Math.max(
    1,
    Math.min(Number.isFinite(requestedLimit) ? requestedLimit : configuredLimit, configuredLimit),
  );
  const sort = sorts.includes(url.searchParams.get("sort") as (typeof sorts)[number])
    ? (url.searchParams.get("sort") as (typeof sorts)[number])
    : "newest";
  try {
    const c = getContainer(),
      page = await c.listingService.queryPublic({
        search: url.searchParams.get("search") ?? undefined,
        cursor: url.searchParams.get("cursor") ?? undefined,
        limit,
        sort,
        featuredOnly,
      }),
      media = await c.listingMediaRepository.listByListings(page.items.map((item) => item.id)),
      ratings = await c.listingReviews.summariesForListings(page.items.map((item) => item.id));
    return Response.json({
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
    });
  } catch (error) {
    return apiError(error);
  }
}
