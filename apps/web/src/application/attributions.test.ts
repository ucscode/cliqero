import { describe, expect, it, vi } from "vitest";
import { ReferralAttributionService } from "./attributions";

describe("deterministic referral URLs", () => {
  it("returns the same URL without creating a link record", async () => {
    const listing = {
      id: "00000000-0000-4000-8000-000000000002",
      sellerId: "00000000-0000-4000-8000-000000000003",
      state: "published" as const,
    };
    const service = new ReferralAttributionService(
      { createAttribution: vi.fn(), resolveActive: vi.fn() } as never,
      { findById: vi.fn(async () => listing) } as never,
      { exists: vi.fn(async () => true) } as never,
    );

    const first = await service.urlFor("00000000-0000-4000-8000-000000000001", listing.id);
    const second = await service.urlFor("00000000-0000-4000-8000-000000000001", listing.id);

    expect(first).toBe(second);
    expect(first).toContain(
      "/r/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002",
    );
    expect(new URL(first).origin).not.toBe("http://0.0.0.0:3000");
  });

  it("rejects malformed public identifiers before querying storage", async () => {
    const listingRepository = { findById: vi.fn() };
    const service = new ReferralAttributionService(
      { createAttribution: vi.fn(), resolveActive: vi.fn() } as never,
      listingRepository as never,
      { exists: vi.fn(async () => true) } as never,
    );

    await expect(service.urlFor("not-a-uuid", "not-a-uuid")).rejects.toThrow("Listing not found");
    await expect(service.visit("not-a-uuid", "not-a-uuid")).resolves.toBeNull();
    expect(listingRepository.findById).not.toHaveBeenCalled();
  });
});
