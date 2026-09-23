import { apiError, authenticatedSessionAccount } from "../../../http";
import { getContainer } from "@/infrastructure/container";

export async function GET(request: Request) {
  const account = await authenticatedSessionAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({
      url: await getContainer().accountReferralAttribution.urlFor(account.id),
    });
  } catch (error) {
    return apiError(error, request);
  }
}
