import { z } from "zod";
import { apiError, authenticatedAccount, authenticatedPrincipal } from "../../http";
import { getContainer } from "@/infrastructure/container";
import { listingWithMediaView } from "@/application/listing/service";
import { apiAuthorizer } from "@/api/shared/authorization";
import { verifyListingPreviewToken } from "@/security/listing-preview";
import { listingPatchSchema } from "../contracts";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> },
) {
  const listingId = (await params).listingId;
  if (!z.uuid().safeParse(listingId).success)
    return Response.json({ error: "Not found" }, { status: 404 });
  const c = getContainer();
  const preview = new URL(request.url).searchParams.get("preview");
  if (verifyListingPreviewToken(preview, listingId)) {
    try {
      const listing = await c.listingService.get(listingId);
      return Response.json(
        listingWithMediaView(
          listing,
          await c.listingMediaRepository.listByListing(listingId),
          c.listingMedia,
          true,
          (await c.listingReviews.summariesForListings([listing.id])).get(listing.id) ?? null,
        ),
        { headers: { "Cache-Control": "private, no-store, max-age=0" } },
      );
    } catch (error) {
      return apiError(error, request);
    }
  }
  const principal = await authenticatedPrincipal(request);
  const managementFailure = apiAuthorizer.authorize(
    principal,
    { mode: "account", capability: "catalogue.manage", scope: "catalogue:manage" },
    request.headers.has("authorization"),
  );
  if (!managementFailure) {
    try {
      const listing = await c.listingService.get(listingId);
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
    const container = getContainer();
    await container.operators.requireCapability(account.id, "catalogue.manage");
    const body = listingPatchSchema.parse(await request.json());
    const listing = await container.listingService.update(account, (await params).listingId, {
      title: body.title,
      shortDescription: body.short_description,
      longDescription: body.long_description,
      priceMinor: body.price_minor,
      currency: body.currency,
      destination: body.destination,
      metadata: body.metadata,
      compareAtPriceMinor: body.compare_at_price_minor,
      featuredPosition: body.featured_position,
      visibility: body.visibility,
      categoryIds: body.category_ids,
      state: body.state,
    });
    return Response.json(
      listingWithMediaView(
        listing,
        await container.listingMediaRepository.listByListing(listing.id),
        container.listingMedia,
        true,
        (await container.listingReviews.summariesForListings([listing.id])).get(listing.id) ?? null,
      ),
    );
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
    await getContainer().listingService.delete(account, listingId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error, request);
  }
}
