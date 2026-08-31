import { z } from "zod";
import { authenticatedAccount, apiError } from "../../../http";
import { getContainer } from "@/infrastructure/container";
const schema = z
  .object({
    amount_minor: z.string().regex(/^[1-9]\d*$/),
    title: z.string().trim().min(1).max(200),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();
export async function POST(request: Request) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const c = getContainer();
    await c.operators.requireOperator(a.id);
    const key = request.headers.get("idempotency-key");
    if (!key) throw new Error("A valid Idempotency-Key is required");
    const b = schema.parse(await request.json()),
      e = await c.treasury.createManual({
        direction: "debit",
        amountMinor: BigInt(b.amount_minor),
        title: b.title,
        note: b.note,
        actorId: a.id,
        idempotencyKey: key,
      });
    return Response.json(
      {
        id: e.id,
        direction: e.direction,
        amount_minor: e.amountMinor.toString(),
        title: e.title,
        note: e.note,
      },
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}
