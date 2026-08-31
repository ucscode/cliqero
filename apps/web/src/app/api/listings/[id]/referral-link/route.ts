import { apiError, authenticatedAccount } from "../../../http";
import { getContainer } from "@/infrastructure/container";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const link = await getContainer().referralAttribution.createLink(account.id, (await params).id);
    const url = new URL(`/r/${link.code}`, request.url);
    return Response.json(
      { referral_link_id: link.id, listing_id: link.listingId, url: url.toString() },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
