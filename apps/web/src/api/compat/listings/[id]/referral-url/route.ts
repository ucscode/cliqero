import { apiError, authenticatedSessionAccount } from "../../../http";
import { getContainer } from "@/infrastructure/container";

/** Return the deterministic share URL without creating persistent link state. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> },
) {
  const account = await authenticatedSessionAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const listingId = (await params).listingId;
    const url = await getContainer().referralAttribution.urlFor(account.id, listingId);
    return Response.json({ listing_id: listingId, url });
  } catch (error) {
    return apiError(error);
  }
}
