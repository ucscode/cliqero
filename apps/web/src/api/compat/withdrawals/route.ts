import { z } from "zod";
import { newId } from "@/kernel/ids";
import { apiError, authenticatedAccount } from "../http";
import { getContainer } from "@/infrastructure/container";
import { presentWithdrawal, presentWithdrawalPolicy } from "./presentation";
const schema = z.object({
  amount_minor: z.string().regex(/^\d+$/),
  currency: z.string().length(3),
  destination_type: z.enum(["bank", "manual"]),
  destination_reference: z.string().min(1).max(500),
});
export async function POST(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const key = request.headers.get("idempotency-key");
    if (!key) throw new Error("A valid Idempotency-Key is required");
    const body = schema.parse(await request.json());
    const withdrawal = await getContainer().withdrawals.request({
      accountId: account.id,
      amountMinor: BigInt(body.amount_minor),
      currency: body.currency.toUpperCase(),
      destinationType: body.destination_type,
      destinationReference: body.destination_reference,
      idempotencyKey: key,
      correlationId: newId(),
    });
    return Response.json(presentWithdrawal(withdrawal), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
export async function GET(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const container = getContainer();
    const [withdrawals, reservations, policy] = await Promise.all([
      container.withdrawals.list(account.id),
      container.fundsReservation.summarize(account.id),
      container.withdrawalPolicy.getActive(),
    ]);
    const availableMinor = await container.fundsReservation.available(
      account.id,
      policy.minimumAmount.currency,
    );
    return Response.json({
      withdrawals: withdrawals.map(presentWithdrawal),
      available_minor: availableMinor.toString(),
      reservations: reservations.map((reservation) => ({
        currency: reservation.currency,
        reserved_minor: reservation.reservedMinor.toString(),
        completed_minor: reservation.completedMinor.toString(),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function policy(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(
      presentWithdrawalPolicy(await getContainer().withdrawalPolicy.getActive()),
    );
  } catch (error) {
    return apiError(error);
  }
}
