import { describe, expect, it, vi } from "vitest";
import { ListingService } from "@/application/listing/service";
import { AuthorizationPolicy } from "@/modules/identity/authorization";
import { Listing, type ListingRepository } from "@/modules/listing";
import { Money } from "@/modules/money/money";

describe("ListingService update", () => {
  it("mutates once with the complete update, persists, and audits", async () => {
    const listing = Listing.create({
      id: "listing-1",
      sellerId: "seller-1",
      title: "Before",
      shortDescription: "A compact summary",
      longDescription: "Details",
      price: Money.of(1200n, "USD"),
      destination: "https://example.test/listing",
    });
    const mutate = vi.spyOn(listing, "update");
    const persist = vi.fn(async () => listing);
    const audit = { record: vi.fn(async () => undefined) };
    const repository = { findById: vi.fn(async () => listing), update: persist };
    const service = new ListingService(
      repository as unknown as ListingRepository,
      new AuthorizationPolicy(),
      audit,
    );

    await service.update({ id: "seller-1" } as never, listing.id, {
      title: "After",
      state: "published",
    });

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "After", state: "published" }),
    );
    expect(persist).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "listing.updated",
        previousState: expect.objectContaining({ state: "draft", title: "Before" }),
        newState: expect.objectContaining({ state: "published", title: "After" }),
      }),
    );
  });
});
