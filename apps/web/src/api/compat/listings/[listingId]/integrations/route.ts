import { z } from "zod";
import { apiError } from "../../../http";
import { authorizeListingIntegration } from "../../integrations/access";

const bodySchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> },
) {
  try {
    const { listingId } = await params;
    const result = await authorizeListingIntegration(request, listingId);
    if ("response" in result) return result.response;
    return Response.json({ items: await result.container.integrations.listForListing(listingId) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> },
) {
  try {
    const { listingId } = await params;
    const result = await authorizeListingIntegration(request, listingId);
    if ("response" in result) return result.response;
    const { name } = bodySchema.parse(await request.json());
    const created = await result.container.database.transaction(() =>
      result.access === "manager"
        ? result.container.integrations.createManaged(result.principal.account.id, name, listingId)
        : result.container.integrations.create(result.principal.account.id, name, listingId),
    );
    return Response.json(
      { integration_id: created.id, credential: created.credential },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
