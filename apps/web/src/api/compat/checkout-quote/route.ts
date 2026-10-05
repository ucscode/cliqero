import { z } from "zod";
import { apiError, authenticatedAccount } from "../http";
import { getContainer } from "@/infrastructure/container";

/** Read-only quote projection; distinct from the persisted Checkout resource. */
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
    return Response.json({
      required: { amount_minor: listing.price.minorAmount.toString(), currency: "USD" },
      available: { amount_minor: balance.available.minorAmount.toString(), currency: "USD" },
      shortfall: { amount_minor: shortfall.toString(), currency: "USD" },
    });
  } catch (error) {
    return apiError(error);
  }
}
