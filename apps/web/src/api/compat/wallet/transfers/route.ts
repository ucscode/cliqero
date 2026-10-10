import { z } from "zod";
import { getContainer } from "@/infrastructure/container";
import { authenticatedAccount, apiError } from "../../http";
import { walletTransferResultSchema } from "./contracts";

const transferSchema = z
  .object({
    from: z.enum(["funding", "earnings"]),
    to: z.enum(["funding", "earnings"]),
    amount_minor: z.string().regex(/^[1-9]\d*$/),
    transaction_pin: z.string().regex(/^\d{6}$/),
  })
  .strict();

export async function POST(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const key = request.headers.get("idempotency-key");
  if (!key)
    return Response.json({ error: "An idempotency-key header is required." }, { status: 400 });
  try {
    const body = transferSchema.parse(await request.json());
    const container = getContainer();
    await container.authentication.requireVerifiedEmail(account.id);
    await container.transactionPin.requireValidPin(account.id, body.transaction_pin);
    const result = await container.walletTransfers.transfer({
      accountId: account.id,
      from: body.from,
      to: body.to,
      grossMinor: BigInt(body.amount_minor),
      idempotencyKey: key,
    });
    return Response.json(walletTransferResultSchema.parse(result), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error, request);
  }
}
