import { z } from "zod";
import { listingWithMediaView } from "@/application/listing/service";
import { apiError } from "@/api/compat/http";
import { getContainer } from "@/infrastructure/container";
import type { ListingState } from "@/modules/listing";

const querySchema = z.object({
  state: z.enum(["draft", "published", "archived"]).optional(),
  search: z.string().max(200).optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  try {
    const container = getContainer();
    const principal = await container.principalResolver.resolve(request);
    if (principal.kind !== "user_session")
      return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const page = await container.listingService.queryOwner(principal.account, {
      ...query,
      state: query.state as ListingState | undefined,
    });
    const media = await container.listingMediaRepository.listByListings(
      page.items.map((listing) => listing.id),
    );
    return Response.json(
      {
        items: page.items.map((listing) =>
          listingWithMediaView(listing, media.get(listing.id) ?? [], container.listingMedia, true),
        ),
        next_cursor: page.nextCursor,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error, request);
  }
}
