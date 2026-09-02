import { z } from "zod";
import { apiError, authenticatedAccount } from "../../http";
import { getContainer } from "@/infrastructure/container";
import { listingWithMediaView, ownerListingView } from "@/application/listings";

const schema = z
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
    const c = getContainer();
    await c.operators.requireCatalogueManager(account.id);
    const b = schema.parse(await request.json());
    const l = await c.listingService.createCatalogue(account, {
      title: b.title,
      description: b.description,
      priceMinor: b.price_minor,
      currency: b.currency,
      destination: b.destination,
      metadata: b.metadata,
      externalKey: b.external_key,
    });
    return Response.json(ownerListingView(l), { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
export async function GET(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const c = getContainer();
    await c.operators.requireCatalogueManager(account.id);
    const u = new URL(request.url),
      query = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
          state: z.enum(["draft", "published", "archived"]).optional(),
          search: z.string().max(200).optional(),
          cursor: z.string().optional(),
        })
        .parse({
          limit: u.searchParams.get("limit") ?? undefined,
          state: u.searchParams.get("state") ?? undefined,
          search: u.searchParams.get("search") ?? undefined,
          cursor: u.searchParams.get("cursor") ?? undefined,
        }),
      page = await c.listingService.queryCatalogue({
        state: query.state,
        search: query.search,
        cursor: query.cursor,
        limit: query.limit,
      }),
      media = await c.listingMediaRepository.listByListings(page.items.map((x) => x.id));
    return Response.json({
      items: page.items.map((x) =>
        listingWithMediaView(x, media.get(x.id) ?? [], c.listingMedia, true),
      ),
      next_cursor: page.nextCursor,
    });
  } catch (e) {
    return apiError(e);
  }
}
