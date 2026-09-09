import { z } from "zod";
import { apiError, authenticatedAccount } from "../../../http";
import { getContainer } from "@/infrastructure/container";
import { ownerListingView, listingWithMediaView } from "@/application/listings";
const schema = z
  .object({
    title: z.string().min(1),
    description: z.string(),
    price_minor: z.string().regex(/^\d+$/),
    currency: z.string().length(3),
    destination: z.url(),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    featured_position: z.number().int().positive().nullable(),
  })
  .partial()
  .strict();
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const c = getContainer();
    await c.operators.requireCapability(a.id, "catalogue.manage");
    const id = (await params).id,
      l = await c.listingService.getCatalogue(id);
    return Response.json(
      listingWithMediaView(
        l,
        await c.listingMediaRepository.listByListing(id),
        c.listingMedia,
        true,
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const c = getContainer();
    await c.operators.requireCapability(a.id, "catalogue.manage");
    const b = schema.parse(await request.json()),
      l = await c.listingService.updateCatalogue(a, (await params).id, {
        title: b.title,
        description: b.description,
        priceMinor: b.price_minor,
        currency: b.currency,
        destination: b.destination,
        metadata: b.metadata,
        featuredPosition: b.featured_position,
      });
    return Response.json(ownerListingView(l));
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const c = getContainer();
    await c.operators.requireCapability(a.id, "catalogue.manage");
    return Response.json(
      ownerListingView(await c.listingService.archiveCatalogue(a, (await params).id)),
    );
  } catch (e) {
    return apiError(e);
  }
}
