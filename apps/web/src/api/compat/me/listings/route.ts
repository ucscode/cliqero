import { authenticatedAccount, apiError } from "../../http";
import { getContainer } from "@/infrastructure/container";
import { listingWithMediaView } from "@/application/listings";
import type { ListingState } from "@/modules/listing/listing";
export async function GET(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    if (state && !(["draft", "published", "archived"] as string[]).includes(state))
      return Response.json({ error: "Invalid state" }, { status: 400 });
    const c = getContainer(),
      page = await c.listingService.queryOwner(account, {
        state: state as ListingState | undefined,
        search: url.searchParams.get("search") ?? undefined,
        cursor: url.searchParams.get("cursor") ?? undefined,
        limit: Math.min(Number(url.searchParams.get("limit") ?? 20), 100),
      }),
      media = await c.listingMediaRepository.listByListings(page.items.map((item) => item.id));
    return Response.json({
      items: page.items.map((item) =>
        listingWithMediaView(item, media.get(item.id) ?? [], c.listingMedia, true),
      ),
      next_cursor: page.nextCursor,
    });
  } catch (error) {
    return apiError(error);
  }
}
