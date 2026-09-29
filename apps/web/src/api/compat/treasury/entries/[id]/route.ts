import { authenticatedAccount, apiError } from "../../../../http";
import { getContainer } from "@/infrastructure/container";
export async function GET(request: Request, { params }: { params: Promise<{ entryId: string }> }) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const c = getContainer();
    await c.operators.requireCapability(a.id, "treasury.manage");
    const e = await c.treasuryRepository.findById((await params).entryId);
    if (!e) throw new Error("Treasury entry not found");
    return Response.json({
      id: e.id,
      direction: e.direction,
      amount_minor: e.amountMinor.toString(),
      title: e.title,
      note: e.note,
      source_kind: e.sourceKind,
      source_id: e.sourceId,
      created_at: e.createdAt.toISOString(),
    });
  } catch (e) {
    return apiError(e);
  }
}
