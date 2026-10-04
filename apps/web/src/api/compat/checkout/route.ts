import { z } from "zod";
import { apiError, authenticatedAccount, referralAttributionSource } from "../http";
import { getContainer } from "@/infrastructure/container";
import {
  checkoutCreateRequestSchema,
  checkoutCreateSchema,
  checkoutQuoteSchema,
} from "./contracts";

export async function GET(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const listingId = new URL(request.url).searchParams.get("listing_id");
  if (!listingId || !z.uuid().safeParse(listingId).success)
    return Response.json({ error: "Listing not found" }, { status: 404 });
  try {
    const container = getContainer();
    const listing = await container.listingService.getAvailableTo(listingId, {
      kind: "authenticated",
    });
    if (!listing) return Response.json({ error: "Listing not found" }, { status: 404 });
    const balance = await container.wallet.summary(account.id);
    const shortfall =
      listing.price.minorAmount > balance.available.minorAmount
        ? listing.price.minorAmount - balance.available.minorAmount
        : 0n;
    return Response.json(
      checkoutQuoteSchema.parse({
        required: { amount_minor: listing.price.minorAmount.toString(), currency: "USD" },
        available: { amount_minor: balance.available.minorAmount.toString(), currency: "USD" },
        shortfall: { amount_minor: shortfall.toString(), currency: "USD" },
      }),
    );
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
    const body = checkoutCreateRequestSchema.parse(await request.json());
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
      checkoutCreateSchema.parse({
        id: checkout.id,
        purchase_id: checkout.purchaseId,
        state: checkout.state,
        required: { amount_minor: checkout.amount.minorAmount.toString(), currency: "USD" },
        available: { amount_minor: balance.available.minorAmount.toString(), currency: "USD" },
        shortfall: { amount_minor: shortfall.toString(), currency: "USD" },
      }),
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
