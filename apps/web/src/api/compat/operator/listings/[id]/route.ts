import { z } from "zod";
import { apiError, authenticatedAccount } from "../../../http";
import { getContainer } from "@/infrastructure/container";
import { ownerListingView, listingWithMediaView } from "@/application/listing/service";
const schema = z
  .object({
    title: z.string().min(1),
    short_description: z.string().max(200),
    long_description: z.string(),
    price_minor: z.string().regex(/^\d+$/),
    currency: z.string().length(3),
    destination: z.url(),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    featured_position: z.number().int().positive().nullable(),
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
    const b = schema.parse(await request.json());
    if (b.state !== undefined) {
      if (Object.keys(b).length !== 1)
        return Response.json({ error: "State changes must be sent alone." }, { status: 400 });
      return Response.json(
        ownerListingView(await c.listingService.setCatalogueState(a, (await params).id, b.state)),
      );
    }
    const l = await c.listingService.updateCatalogue(a, (await params).id, {
      title: b.title,
      shortDescription: b.short_description,
      longDescription: b.long_description,
      priceMinor: b.price_minor,
      currency: b.currency,
      destination: b.destination,
      metadata: b.metadata,
      featuredPosition: b.featured_position,
      compareAtPriceMinor: b.compare_at_price_minor,
      visibility: b.visibility,
      categoryIds: b.category_ids,
    });
    return Response.json(ownerListingView(l));
  } catch (e) {
    return apiError(e);
  }
}
