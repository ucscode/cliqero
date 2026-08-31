import { z } from "zod";
import { apiError, authenticatedAccount } from "../../../http";
import { getContainer } from "@/infrastructure/container";

const limitSchema = z.coerce.number().int().min(1).max(100).default(50);
export async function GET(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const limit = limitSchema.parse(new URL(request.url).searchParams.get("limit") ?? undefined);
    return Response.json({
      events: await getContainer().paystackInspection.listEvents(account.id, limit),
    });
  } catch (error) {
    return apiError(error);
  }
}
