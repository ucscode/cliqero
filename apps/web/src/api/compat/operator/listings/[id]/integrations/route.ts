import { z } from "zod";
import { authenticatedAccount, apiError } from "../../../../../http";
import { getContainer } from "@/infrastructure/container";

const schema = z.object({ name: z.string().trim().min(1).max(100) }).strict();

async function authorize(request: Request, id: string) {
  const account = await authenticatedAccount(request);
  if (!account) return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const container = getContainer();
  await container.operators.requireCatalogueManager(account.id);
  await container.listingService.getCatalogue(id);
  return { account, container };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await authorize(request, (await params).id);
    if ("response" in result) return result.response;
    return Response.json({
      items: await result.container.integrations.listForListing((await params).id),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    const result = await authorize(request, id);
    if ("response" in result) return result.response;
    const body = schema.parse(await request.json());
    const created = await result.container.database.transaction(() =>
      result.container.integrations.createManaged(result.account.id, body.name, id),
    );
    return Response.json(
      { integration_id: created.id, credential: created.credential },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
