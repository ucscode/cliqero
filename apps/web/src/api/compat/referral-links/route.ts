import { authenticatedAccount, apiError } from "../http";
import { getContainer } from "@/infrastructure/container";
const view = (
  link: {
    id: string;
    code: string;
    listingId: string;
    listingTitle?: string | null;
    state: string;
    createdAt?: Date;
  },
  request: Request,
) => ({
  id: link.id,
  listing_id: link.listingId,
  listing_title: link.listingTitle ?? null,
  state: link.state,
  ...(link.createdAt ? { created_at: link.createdAt.toISOString() } : {}),
  url: new URL(`/r/${link.code}`, request.url).toString(),
});
export async function GET(request: Request) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({
      items: (await getContainer().referralAttribution.listLinks(a.id)).map((link) =>
        view(link, request),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
