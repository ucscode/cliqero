import { z } from "zod";
import { apiError, authenticatedAccount, authenticatedPrincipal } from "../../http";
import { getContainer } from "@/infrastructure/container";
import { ownerListingView, listingWithMediaView } from "@/application/listing/service";
import { apiAuthorizer } from "@/api/shared/authorization";

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
export async function GET(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> },
) {
  const listingId = (await params).listingId;
  if (!z.uuid().safeParse(listingId).success)
    return Response.json({ error: "Not found" }, { status: 404 });
  const c = getContainer();
  const principal = await authenticatedPrincipal(request);
  const managementFailure = apiAuthorizer.authorize(
    principal,
    { mode: "account", capability: "catalogue.manage", scope: "catalogue:manage" },
    request.headers.has("authorization"),
  );
  if (!managementFailure) {
    try {
      const listing = await c.listingService.getCatalogue(listingId);
      return Response.json(
        listingWithMediaView(
          listing,
          await c.listingMediaRepository.listByListing(listingId),
          c.listingMedia,
          true,
          (await c.listingReviews.summariesForListings([listing.id])).get(listing.id) ?? null,
        ),
      );
    } catch (error) {
      return apiError(error, request);
    }
  }
  const account = await authenticatedAccount(request);
  if (account) {
    try {
      const listing = await c.listingService.getOwner(account, listingId);
      return Response.json(
        listingWithMediaView(
          listing,
          await c.listingMediaRepository.listByListing(listingId),
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
    listingId,
    account ? { kind: "authenticated" } : { kind: "anonymous" },
  );
  return listing
    ? Response.json(
        listingWithMediaView(
          listing,
          await c.listingMediaRepository.listByListing(listingId),
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
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> },
) {
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
            (await params).listingId,
            body.state,
          ),
        ),
      );
    }
    const listing = await getContainer().listingService.updateCatalogue(
      account,
      (await params).listingId,
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> },
) {
  const principal = await authenticatedPrincipal(request);
  const denied = apiAuthorizer.authorize(
    principal,
    { mode: "account", capability: "catalogue.manage", scope: "catalogue:manage" },
    request.headers.has("authorization"),
  );
  if (denied)
    return Response.json(
      { error: denied === "unauthorized" ? "Unauthorized" : "Forbidden" },
      { status: denied === "unauthorized" ? 401 : 403 },
    );
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const listingId = (await params).listingId;
  if (!z.uuid().safeParse(listingId).success)
    return Response.json({ error: "Listing not found" }, { status: 404 });
  try {
    await getContainer().listingService.deleteCatalogue(account, listingId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error, request);
  }
}
