import { authenticatedAccount, apiError } from "../../http";
import { getContainer } from "@/infrastructure/container";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ purchaseId: string }> },
) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(
      await getContainer().accountProjections.purchase(a.id, (await params).purchaseId),
    );
  } catch (error) {
    return apiError(error);
  }
}
