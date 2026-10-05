import { describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({ getContainer: () => fixtures.container }));

import { GET, POST } from "@/api/compat/checkout/route";
import { GET as getQuote } from "@/api/compat/checkout-quote/route";

const account = { id: "00000000-0000-4000-8000-000000000001" };
const checkoutId = "00000000-0000-4000-8000-000000000003";
const purchaseId = "00000000-0000-4000-8000-000000000004";
const listing = {
  id: "00000000-0000-4000-8000-000000000002",
  price: { minorAmount: 0n, currency: "USD" },
};

function configure() {
  const container = {
    principalResolver: { resolve: vi.fn(async () => ({ account, kind: "user_session" })) },
    listingService: {
      getAvailableTo: vi.fn(async (_id: string, viewer: { kind: string }) => {
        expect(viewer.kind).toBe("authenticated");
        return listing;
      }),
    },
    wallet: {
      summary: vi.fn(async () => ({
        available: { minorAmount: 999n },
        pending: { minorAmount: 0n },
      })),
    },
    walletCheckout: {
      listForBuyer: vi.fn(async () => [
        {
          id: "checkout-1",
          purchaseId: "purchase-1",
          state: "pending",
          amount: { minorAmount: 999n, currency: "USD" },
        },
      ]),
      initiate: vi.fn(async () => ({
        id: checkoutId,
        purchaseId,
        state: "pending",
        amount: { minorAmount: 0n, currency: "USD" },
      })),
    },
  };
  fixtures.container = container;
  return container;
}

describe("free listing checkout compatibility route", () => {
  it("lists persisted Checkout resources rather than returning a quote", async () => {
    const container = configure();
    const response = await GET(new Request("http://localhost/api/checkouts?limit=5"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      items: [{ id: "checkout-1", purchase_id: "purchase-1", amount_minor: "999" }],
      next_cursor: null,
    });
    expect(container.walletCheckout.listForBuyer).toHaveBeenCalledWith(account.id, 5);
    expect(container.wallet.summary).not.toHaveBeenCalled();
  });

  it("keeps quote projection at the separate quote endpoint", async () => {
    const container = configure();
    const response = await getQuote(
      new Request(`http://localhost/api/checkout-quote?listing_id=${listing.id}`),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      required: { amount_minor: "0", currency: "USD" },
      available: { amount_minor: "999", currency: "USD" },
      shortfall: { amount_minor: "0", currency: "USD" },
    });
    expect(container.wallet.summary).toHaveBeenCalledOnce();
  });

  it("creates the normal checkout/purchase response without wallet prerequisites", async () => {
    const container = configure();
    const response = await POST(
      new Request("http://localhost/api/checkouts", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "free-test-1" },
        body: JSON.stringify({ listing_id: listing.id }),
      }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: checkoutId,
      purchase_id: purchaseId,
      required: { amount_minor: "0", currency: "USD" },
      available: { amount_minor: "999", currency: "USD" },
      shortfall: { amount_minor: "0", currency: "USD" },
    });
    expect(container.walletCheckout.initiate).toHaveBeenCalledWith({
      buyerId: account.id,
      listingId: listing.id,
      idempotencyKey: "free-test-1",
      attributionSource: undefined,
    });
    expect(container.wallet.summary).toHaveBeenCalledOnce();
  });

  it("rejects client-supplied free pricing instead of initiating a checkout", async () => {
    const container = configure();
    const response = await POST(
      new Request("http://localhost/api/checkouts", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "free-test-2" },
        body: JSON.stringify({ listing_id: listing.id, amount_minor: "0", free: true }),
      }),
    );
    expect(response.status).toBe(400);
    expect(container.walletCheckout.initiate).not.toHaveBeenCalled();
  });
});
