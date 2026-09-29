import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({ getContainer: () => state.container }));
vi.mock("@/config/storefront", () => ({
  loadStorefrontConfiguration: () => ({
    home: { featured_limit: 6 },
    catalogue: { page_size: 12 },
  }),
}));

import { GET } from "@/api/compat/listings/route";

function configure() {
  const queryStorefront = vi.fn(async () => ({ items: [], nextCursor: null }));
  state.container = {
    principalResolver: { resolve: vi.fn(async () => null) },
    listingService: { queryStorefront },
    listingMediaRepository: { listByListings: vi.fn(async () => new Map()) },
    listingMedia: { publicUrl: vi.fn() },
    listingReviews: { summariesForListings: vi.fn(async () => new Map()) },
  };
  return queryStorefront;
}

describe("catalogue listing route sorting contract", () => {
  it("defaults to date descending and forwards separate sort and direction values", async () => {
    const query = configure();
    const response = await GET(new Request("http://localhost/api/listings"));
    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      { kind: "anonymous" },
      expect.objectContaining({ sort: "date", direction: "desc" }),
    );
  });

  it.each([
    ["date", "asc"],
    ["price", "asc"],
    ["price", "desc"],
    ["title", "asc"],
    ["title", "desc"],
    ["rating", "asc"],
    ["rating", "desc"],
  ])("passes sort=%s and direction=%s independently", async (sort, direction) => {
    const query = configure();
    const response = await GET(
      new Request(`http://localhost/api/listings?sort=${sort}&direction=${direction}`),
    );
    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      { kind: "anonymous" },
      expect.objectContaining({ sort, direction }),
    );
  });
});
