import { authenticatedAccount, apiError } from "../../../../../http";
import { getContainer } from "@/infrastructure/container";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ listingId: string; integrationId: string }> },
) {
  try {
    const values = await params;
    const account = await authenticatedAccount(request);
    if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const container = getContainer();
    await container.listingService.getOwner(account, values.listingId);
    const integration = await container.integrations.find(account.id, values.integrationId);
    if (!integration.listing_ids.includes(values.listingId))
      return Response.json({ error: "Integration not found" }, { status: 404 });
    return Response.json(await container.integrations.rotate(account.id, values.integrationId));
  } catch (error) {
    return apiError(error);
  }
}
