import { z } from "zod";
import { newId } from "@/kernel/ids";
import { apiError, authenticatedPrincipal } from "../http";
import { getContainer } from "@/infrastructure/container";
import { presentWithdrawal, presentWithdrawalPolicy } from "./presentation";
import { validationErrorPayload } from "@/api/error";
const schema = z
  .object({
    amount_minor: z.string().regex(/^\d+$/),
    currency: z.string().length(3),
    destination_id: z.string().uuid(),
  })
  .strict();
export async function POST(request: Request) {
  const principal = await authenticatedPrincipal(request);
  if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (principal.kind === "api_key" && !principal.scopes.has("withdrawals:create"))
    return Response.json({ error: "Forbidden", code: "insufficient_scope" }, { status: 403 });
  try {
    const key = request.headers.get("idempotency-key");
    if (!key) throw new Error("A valid Idempotency-Key is required");
    const body = schema.parse(await request.json());
    const withdrawal = await getContainer().withdrawals.request({
      accountId: principal.accountId,
      amountMinor: BigInt(body.amount_minor),
      currency: body.currency.toUpperCase(),
      destinationId: body.destination_id,
      idempotencyKey: key,
      correlationId: newId(),
    });
    return Response.json(presentWithdrawal(withdrawal), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(validationErrorPayload(error), { status: 400 });
    return apiError(error);
  }
}
export async function GET(request: Request) {
  const principal = await authenticatedPrincipal(request);
  if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (principal.kind === "api_key" && !principal.scopes.has("withdrawals:read"))
    return Response.json({ error: "Forbidden", code: "insufficient_scope" }, { status: 403 });
  try {
    const container = getContainer();
    const [withdrawals, reservations, policy] = await Promise.all([
      container.withdrawals.list(principal.accountId),
      container.fundsReservation.summarize(principal.accountId),
      container.withdrawalPolicy.getActive(),
    ]);
    const availableMinor = await container.fundsReservation.available(
      principal.accountId,
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
  const principal = await authenticatedPrincipal(request);
  if (!principal) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (principal.kind === "api_key" && !principal.scopes.has("withdrawals:read"))
    return Response.json({ error: "Forbidden", code: "insufficient_scope" }, { status: 403 });
  try {
    return Response.json(
      presentWithdrawalPolicy(await getContainer().withdrawalPolicy.getActive()),
    );
  } catch (error) {
    return apiError(error);
  }
}
