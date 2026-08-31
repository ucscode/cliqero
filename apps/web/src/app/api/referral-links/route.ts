import { authenticatedAccount, apiError } from "../http";
import { getContainer } from "@/infrastructure/container";
const view = (
  link: { id: string; code: string; listingId: string; state: string },
  request: Request,
) => ({
  id: link.id,
  listing_id: link.listingId,
  state: link.state,
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
