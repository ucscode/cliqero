import { describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => fixtures.container,
}));

import { GET } from "@/api/compat/listings/[id]/route";

const listing = {
  id: "00000000-0000-4000-8000-000000000001",
  sellerId: "00000000-0000-4000-8000-000000000002",
  title: "Public item",
  description: "Description",
  price: { minorAmount: 100n, currency: "USD" },
  metadata: {},
  state: "published",
  destination: "https://example.com/item",
  externalKey: null,
};

function configure(principal: any, ownerError = true) {
  fixtures.container = {
    principalResolver: { resolve: vi.fn(async () => principal) },
    listingService: {
      getOwner: vi.fn(async () => {
        if (ownerError) throw new Error("Forbidden");
        return listing;
      }),
      getPublic: vi.fn(async () => listing),
    },
    listingMediaRepository: { listByListing: vi.fn(async () => []) },
    listingMedia: { publicUrl: vi.fn() },
  };
}

const context = { params: Promise.resolve({ id: listing.id }) };

describe("public listing detail compatibility route", () => {
  it("serves the published public projection anonymously", async () => {
    configure(null);
    const response = await GET(new Request(`http://localhost/api/listings/${listing.id}`), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: listing.id, title: listing.title });
  });

  it("does not require catalogue:read from an API key for public detail", async () => {
    configure({
      accountId: "00000000-0000-4000-8000-000000000003",
      account: { id: "00000000-0000-4000-8000-000000000003" },
      kind: "api_key",
      roles: [],
      scopes: new Set(),
    });
    const response = await GET(
      new Request(`http://localhost/api/listings/${listing.id}`, {
        headers: { authorization: "Bearer cliq_live_public" },
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: listing.id, title: listing.title });
  });

  it("retains owner projection behavior for an authenticated owner session", async () => {
    configure(
      {
        accountId: listing.sellerId,
        account: { id: listing.sellerId },
        kind: "user_session",
        roles: [],
        scopes: new Set(),
      },
      false,
    );
    const response = await GET(new Request(`http://localhost/api/listings/${listing.id}`), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty("destination", listing.destination);
  });
});
