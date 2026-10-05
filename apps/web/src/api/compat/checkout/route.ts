import { z } from "zod";
import { apiError, authenticatedAccount, referralAttributionSource } from "../http";
import { getContainer } from "@/infrastructure/container";

const bodySchema = z.object({ listing_id: z.uuid() }).strict();

export async function GET(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const limit = Math.max(
      1,
      Math.min(Number(new URL(request.url).searchParams.get("limit") ?? 50) || 50, 100),
    );
    const items = await getContainer().walletCheckout.listForBuyer(account.id, limit);
    return Response.json({
      items: items.map((checkout) => ({
        id: checkout.id,
        purchase_id: checkout.purchaseId,
        state: checkout.state,
        amount_minor: checkout.amount.minorAmount.toString(),
        currency: checkout.amount.currency,
      })),
      next_cursor: null,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey)
    return Response.json({ error: "Idempotency-Key is required" }, { status: 400 });
  try {
    const body = bodySchema.parse(await request.json());
    const checkout = await getContainer().walletCheckout.initiate({
      buyerId: account.id,
      listingId: body.listing_id,
      idempotencyKey,
      attributionSource: referralAttributionSource(request),
    });
    const balance = await getContainer().wallet.summary(account.id);
    const shortfall =
      checkout.amount.minorAmount > balance.available.minorAmount
        ? checkout.amount.minorAmount - balance.available.minorAmount
        : 0n;
    return Response.json(
      {
        id: checkout.id,
        purchase_id: checkout.purchaseId,
        state: checkout.state,
        required: { amount_minor: checkout.amount.minorAmount.toString(), currency: "USD" },
        available: { amount_minor: balance.available.minorAmount.toString(), currency: "USD" },
        shortfall: { amount_minor: shortfall.toString(), currency: "USD" },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
