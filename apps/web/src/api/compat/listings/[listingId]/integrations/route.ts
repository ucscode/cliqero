import { z } from "zod";
import { apiError, authenticatedAccount } from "../../../http";
import { getContainer } from "@/infrastructure/container";

const bodySchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();

async function authorizeListing(request: Request, listingId: string) {
  const account = await authenticatedAccount(request);
  if (!account) return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const container = getContainer();
  await container.listingService.getOwner(account, listingId);
  return { account, container };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> },
) {
  try {
    const { listingId } = await params;
    const result = await authorizeListing(request, listingId);
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
    const result = await authorizeListing(request, listingId);
    if ("response" in result) return result.response;
    const { name } = bodySchema.parse(await request.json());
    const created = await result.container.database.transaction(() =>
      result.container.integrations.create(result.account.id, name, listingId),
    );
    return Response.json(
      { integration_id: created.id, credential: created.credential },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
