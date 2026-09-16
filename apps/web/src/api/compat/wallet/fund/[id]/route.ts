import { z } from "zod";
import { apiError, authenticatedAccount } from "../../../http";
import { getContainer } from "@/infrastructure/container";
import { projectFundingStatus } from "../status";

export { customerFailureMessage } from "../status";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  if (!z.uuid().safeParse(id).success)
    return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const container = getContainer();
    const funding = await container.funding.findById(id);
    if (!funding || funding.accountId !== account.id)
      return Response.json({ error: "Funding not found" }, { status: 404 });
    return Response.json(await projectFundingStatus(container, account.id, funding));
  } catch (error) {
    return apiError(error);
  }
}
