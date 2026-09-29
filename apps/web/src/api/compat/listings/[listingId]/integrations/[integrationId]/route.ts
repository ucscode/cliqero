import { z } from "zod";
import { apiError, authenticatedAccount } from "../../../../http";
import { getContainer } from "@/infrastructure/container";

const schema = z.object({ name: z.string().trim().min(1).max(100) }).strict();

async function ownedIntegration(request: Request, listingId: string, integrationId: string) {
  const account = await authenticatedAccount(request);
  if (!account) return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const container = getContainer();
  await container.listingService.getOwner(account, listingId);
  const integration = await container.integrations.find(account.id, integrationId);
  if (!integration.listing_ids.includes(listingId)) throw new Error("Integration not found");
  return { account, container };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ listingId: string; integrationId: string }> },
) {
  try {
    const values = await params;
    const result = await ownedIntegration(request, values.listingId, values.integrationId);
    if ("response" in result) return result.response;
    return Response.json(
      await result.container.integrations.find(result.account.id, values.integrationId),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ listingId: string; integrationId: string }> },
) {
  try {
    const values = await params;
    const result = await ownedIntegration(request, values.listingId, values.integrationId);
    if ("response" in result) return result.response;
    const { name } = schema.parse(await request.json());
    return Response.json(
      await result.container.integrations.update(result.account.id, values.integrationId, name),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ listingId: string; integrationId: string }> },
) {
  try {
    const values = await params;
    const result = await ownedIntegration(request, values.listingId, values.integrationId);
    if ("response" in result) return result.response;
    return Response.json(
      await result.container.integrations.revoke(result.account.id, values.integrationId),
    );
  } catch (error) {
    return apiError(error);
  }
}
