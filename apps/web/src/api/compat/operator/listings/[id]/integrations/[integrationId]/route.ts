import { authenticatedAccount, apiError } from "../../../../../http";
import { getContainer } from "@/infrastructure/container";

async function authorize(request: Request, listingId: string) {
  const account = await authenticatedAccount(request);
  if (!account) return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const container = getContainer();
  await container.operators.requireCatalogueManager(account.id);
  await container.listingService.getCatalogue(listingId);
  return { account, container };
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; integrationId: string }> },
) {
  try {
    const values = await params;
    const result = await authorize(request, values.id);
    if ("response" in result) return result.response;
    return Response.json({
      items: await result.container.integrations.revokeForListing(
        result.account.id,
        values.id,
        values.integrationId,
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
