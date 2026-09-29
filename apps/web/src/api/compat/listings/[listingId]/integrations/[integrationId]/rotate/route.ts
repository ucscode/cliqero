import { apiError } from "../../../../../http";
import { authorizeListingIntegration } from "../../../../integrations/access";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ listingId: string; integrationId: string }> },
) {
  try {
    const values = await params;
    const access = await authorizeListingIntegration(request, values.listingId);
    if ("response" in access) return access.response;
    if (access.access === "manager")
      return Response.json(
        await access.container.integrations.rotateForListing(
          access.principal.account.id,
          values.listingId,
          values.integrationId,
        ),
      );
    const integration = await access.container.integrations.find(
      access.principal.account.id,
      values.integrationId,
    );
    if (!integration.listing_ids.includes(values.listingId))
      return Response.json({ error: "Integration not found" }, { status: 404 });
    return Response.json(
      await access.container.integrations.rotate(access.principal.account.id, values.integrationId),
    );
  } catch (error) {
    return apiError(error);
  }
}
