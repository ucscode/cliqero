import { authenticatedAccount } from "../http";
import { getContainer } from "@/infrastructure/container";
export async function GET(request: Request) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const s = await getContainer().wallet.summary(a.id);
  return Response.json({
    currency: "USD",
    available_minor: s.available.minorAmount.toString(),
    pending_minor: s.pending.minorAmount.toString(),
  });
}
