import { z } from "zod";
import { apiError, authenticatedAccount } from "../../http";
import { getContainer } from "@/infrastructure/container";
import { ownerListingView, listingWithMediaView } from "@/application/listing/service";

const listingSchema = z
  .object({
    title: z.string().min(1),
    short_description: z.string().max(200),
    long_description: z.string(),
    price_minor: z.string().regex(/^\d+$/),
    currency: z.string().length(3),
    destination: z.url(),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    compare_at_price_minor: z.string().regex(/^\d+$/).nullable(),
    visibility: z.enum(["public", "authenticated"]),
    state: z.enum(["draft", "published", "archived"]),
    category_ids: z
      .array(z.uuid())
      .max(30)
      .refine((ids) => new Set(ids).size === ids.length, "Category IDs must be unique"),
  })
  .partial()
  .strict();
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!z.uuid().safeParse(id).success)
    return Response.json({ error: "Not found" }, { status: 404 });
  const c = getContainer();
  const account = await authenticatedAccount(request);
  if (account) {
    try {
      const listing = await c.listingService.getOwner(account, id);
      return Response.json(
        listingWithMediaView(
          listing,
          await c.listingMediaRepository.listByListing(id),
          c.listingMedia,
          true,
          (await c.listingReviews.summariesForListings([listing.id])).get(listing.id) ?? null,
        ),
      );
    } catch {
      /* Authenticated non-owners still receive the public projection when the listing is published. */
    }
  }
  const listing = await c.listingService.getAvailableTo(
    id,
    account ? { kind: "authenticated" } : { kind: "anonymous" },
  );
  return listing
    ? Response.json(
        listingWithMediaView(
          listing,
          await c.listingMediaRepository.listByListing(id),
          c.listingMedia,
          false,
          (await c.listingReviews.summariesForListings([listing.id])).get(listing.id) ?? null,
        ),
        { headers: { "Cache-Control": "private, no-store, max-age=0" } },
      )
    : Response.json(
        { error: "Not found" },
        { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } },
      );
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await getContainer().operators.requireCapability(account.id, "catalogue.manage");
    const body = listingSchema.parse(await request.json());
    if (body.state !== undefined) {
      if (Object.keys(body).length !== 1)
        return Response.json({ error: "State changes must be sent alone." }, { status: 400 });
      return Response.json(
        ownerListingView(
          await getContainer().listingService.setCatalogueState(
            account,
            (await params).id,
            body.state,
          ),
        ),
      );
    }
    const listing = await getContainer().listingService.updateCatalogue(
      account,
      (await params).id,
      {
        title: body.title,
        shortDescription: body.short_description,
        longDescription: body.long_description,
        priceMinor: body.price_minor,
        currency: body.currency,
        destination: body.destination,
        metadata: body.metadata,
        compareAtPriceMinor: body.compare_at_price_minor,
        visibility: body.visibility,
        categoryIds: body.category_ids,
      },
    );
    return Response.json(ownerListingView(listing));
  } catch (error) {
    return apiError(error);
  }
}
