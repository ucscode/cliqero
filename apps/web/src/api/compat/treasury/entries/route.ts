import { authenticatedAccount, apiError } from "../../../http";
import { getContainer } from "@/infrastructure/container";

export async function POST() {
  return Response.json(
    { error: "Use the Treasury adjustment workflow.", code: "gone" },
    { status: 410 },
  );
}

export async function GET(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const container = getContainer();
    await container.operators.requireCapability(account.id, "treasury.manage");
    const url = new URL(request.url);
    const page = await container.treasuryRepository.list({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: Math.min(Number(url.searchParams.get("limit") ?? 20), 100),
      direction: (url.searchParams.get("direction") as "credit" | "debit" | null) ?? undefined,
    });
    return Response.json({ items: page.items.map(serialize), next_cursor: page.nextCursor });
  } catch (error) {
    return apiError(error);
  }
}

const serialize = (entry: any) => ({
  ...entry,
  amount_minor: entry.amountMinor.toString(),
  source_kind: entry.sourceKind,
  source_id: entry.sourceId,
  actor_id: entry.actorId,
  created_at: entry.createdAt.toISOString(),
  amountMinor: undefined,
  sourceKind: undefined,
  sourceId: undefined,
  actorId: undefined,
  createdAt: undefined,
  idempotencyKey: undefined,
});
