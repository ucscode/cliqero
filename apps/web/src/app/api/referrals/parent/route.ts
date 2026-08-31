import { z } from "zod";
import { apiError, authenticatedAccount } from "../../http";
import { getContainer } from "@/infrastructure/container";

const schema = z.object({ parent_account_id: z.uuid() });
export async function POST(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = schema.parse(await request.json());
    await getContainer().referralGraphService.establish(account.id, body.parent_account_id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
