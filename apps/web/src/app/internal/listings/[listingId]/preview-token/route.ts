import { authenticatedAccount } from "@/api/http";
import { getContainer } from "@/infrastructure/container";
import { createListingPreviewToken } from "@/security/listing-preview";
import { hasCapability } from "@/modules/identity/capabilities";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ listingId: string }> }) {
  if (request.headers.has("authorization"))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const container = getContainer();
  const capabilities = await container.operators.capabilities(account.id);
  if (!hasCapability(capabilities, "catalogue.manage"))
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const { listingId } = await context.params;
  const listing = await container.listingService.getCatalogue(listingId).catch(() => null);
  if (!listing) return Response.json({ error: "Not found" }, { status: 404 });
  const token = createListingPreviewToken(listingId);
  const url = new URL(`/listings/${listingId}`, request.url);
  url.searchParams.set("preview", token);
  return Response.json(
    { url: url.toString(), expires_in: 600 },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
