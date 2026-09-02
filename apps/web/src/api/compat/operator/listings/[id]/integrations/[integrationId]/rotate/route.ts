import { authenticatedAccount, apiError } from "../../../../../../http";
import { getContainer } from "@/infrastructure/container";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; integrationId: string }> },
) {
  try {
    const values = await params;
    const account = await authenticatedAccount(request);
    if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const container = getContainer();
    await container.operators.requireCatalogueManager(account.id);
    await container.listingService.getCatalogue(values.id);
    return Response.json(
      await container.integrations.rotateForListing(account.id, values.id, values.integrationId),
    );
  } catch (error) {
    return apiError(error);
  }
}
