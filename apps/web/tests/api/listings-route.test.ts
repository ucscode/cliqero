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
    principalResolver: {
      resolve: vi.fn(async () => ({
        kind: "anonymous",
        accountId: null,
        account: null,
        capabilities: [],
        scopes: new Set<string>(),
      })),
    },
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

  it("allows the configured CRUD page size for privileged catalogue filters", async () => {
    const queryCatalogue = vi.fn(async () => ({ items: [], nextCursor: null }));
    const container = {
      principalResolver: {
        resolve: vi.fn(async () => ({
          kind: "user_session" as const,
          accountId: "operator-id",
          account: { id: "operator-id", username: "operator", country: "NG" },
          capabilities: ["catalogue.manage" as const],
          scopes: new Set<string>(),
        })),
      },
      listingService: { queryCatalogue },
      listingMediaRepository: { listByListings: vi.fn(async () => new Map()) },
      listingMedia: { publicUrl: vi.fn() },
    };
    const response = await GET(new Request("http://localhost/api/listings?state=all&limit=50"), {
      container: container as any,
    });

    expect(response.status).toBe(200);
    expect(queryCatalogue).toHaveBeenCalledWith(
      expect.objectContaining({ state: undefined, limit: 50, sort: "date", direction: "desc" }),
    );
  });

  it("rejects unsupported sort fields and directions", async () => {
    configure();
    const sortResponse = await GET(new Request("http://localhost/api/listings?sort=owner"));
    const directionResponse = await GET(
      new Request("http://localhost/api/listings?direction=sideways"),
    );
    expect(sortResponse.status).toBe(400);
    expect(directionResponse.status).toBe(400);
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
