import { authenticatedAccount, apiError } from "../../../http";
import { getContainer } from "@/infrastructure/container";
import { ownerListingView } from "@/application/listings";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const c = getContainer();
    await c.operators.requireCatalogueManager(account.id);
    return Response.json(
      ownerListingView(await c.listingService.restoreCatalogue(account, (await params).id)),
    );
  } catch (error) {
    return apiError(error);
  }
}
