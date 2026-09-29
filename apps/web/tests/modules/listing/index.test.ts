import { describe, expect, it } from "vitest";
import { Listing } from "@/modules/listing";
import { Money } from "@/modules/money/money";
const create = () =>
  Listing.create({
    id: "listing",
    sellerId: "seller",
    title: "Draft",
    shortDescription: "Quick summary",
    longDescription: "Detailed listing description.",
    price: Money.of(100n, "USD"),
    destination: "https://example.com",
  });
describe("Listing lifecycle", () => {
  it("allows a published zero-price listing while rejecting negative prices", () => {
    const free = Listing.create({
      id: "free-listing",
      sellerId: "seller",
      title: "Free listing",
      shortDescription: "No charge",
      longDescription: "Free access.",
      price: Money.of(0n, "USD"),
      destination: "https://example.com/free",
    });
    free.publish();
    expect(free.commercialSnapshot().price.minorAmount).toBe("0");
    expect(() => Money.of(-1n, "USD")).toThrow("Money cannot be negative");
  });

  it("uses explicit draft, publish, archive, and draft restore transitions", () => {
    const listing = create();
    expect(listing.state).toBe("draft");
    listing.publish();
    expect(listing.state).toBe("published");
    listing.archive();
    expect(listing.state).toBe("archived");
    listing.restore();
    expect(listing.state).toBe("draft");
  });
  it("does not permit direct republishing from archived", () => {
    const listing = create();
    listing.archive();
    expect(() => listing.publish()).toThrow();
  });

  it("requires a short description when publishing and preserves that invariant on update", () => {
    const draft = Listing.create({
      id: "listing-empty",
      sellerId: "seller-1",
      title: "Draft",
      shortDescription: "   ",
      longDescription: "Details",
      price: Money.of(100n, "USD"),
      destination: "https://example.com",
    });
    expect(draft.shortDescription).toBe("");
    expect(() => draft.publish()).toThrow("Published listing short description is required");

    const published = create();
    published.publish();
    expect(() =>
      published.update({
        title: published.title,
        shortDescription: "   ",
        longDescription: published.longDescription,
        price: published.price,
        destination: published.destination,
        metadata: published.metadata,
      }),
    ).toThrow("Published listing short description is required");
    expect(published.shortDescription).toBe("Quick summary");
    published.update({
      title: published.title,
      shortDescription: "Updated summary",
      longDescription: published.longDescription,
      price: published.price,
      destination: published.destination,
      metadata: published.metadata,
    });
    expect(published.shortDescription).toBe("Updated summary");
  });

  it("allows empty summaries on draft and archived listings", () => {
    const draft = create();
    draft.update({
      title: draft.title,
      shortDescription: "",
      longDescription: draft.longDescription,
      price: draft.price,
      destination: draft.destination,
      metadata: draft.metadata,
    });
    expect(draft.shortDescription).toBe("");
    draft.archive();
    draft.update({
      title: draft.title,
      shortDescription: " ",
      longDescription: draft.longDescription,
      price: draft.price,
      destination: draft.destination,
      metadata: draft.metadata,
    });
    expect(draft.shortDescription).toBe("");
  });

  it("stores independent trimmed descriptions and enforces the short limit", () => {
    const listing = Listing.create({
      id: "listing-2",
      sellerId: "seller-1",
      title: "Draft",
      shortDescription: "  Quick benefit  ",
      longDescription: "  Full Markdown **details**  ",
      price: Money.of(100n, "USD"),
      destination: "https://example.com",
    });
    expect(listing.shortDescription).toBe("Quick benefit");
    expect(listing.longDescription).toBe("Full Markdown **details**");
    expect(() =>
      Listing.create({
        id: "listing-3",
        sellerId: "seller-1",
        title: "Too long",
        shortDescription: "x".repeat(201),
        longDescription: "Details",
        price: Money.of(100n, "USD"),
        destination: "https://example.com",
      }),
    ).toThrow("200 characters or fewer");
  });

  it("updates each description without mutating the other", () => {
    const listing = create();
    listing.update({
      title: listing.title,
      shortDescription: "New summary",
      longDescription: listing.longDescription,
      price: listing.price,
      destination: listing.destination,
      metadata: listing.metadata,
    });
    expect(listing.shortDescription).toBe("New summary");
    expect(listing.longDescription).toBe("Detailed listing description.");
    listing.update({
      title: listing.title,
      shortDescription: listing.shortDescription,
      longDescription: "New details",
      price: listing.price,
      destination: listing.destination,
      metadata: listing.metadata,
    });
    expect(listing.shortDescription).toBe("New summary");
    expect(listing.longDescription).toBe("New details");
  });

  it("includes both descriptions in the commercial snapshot", () => {
    const listing = Listing.create({
      id: "listing-4",
      sellerId: "seller-1",
      title: "Published",
      shortDescription: "Quick benefit",
      longDescription: "Full details",
      price: Money.of(100n, "USD"),
      destination: "https://example.com",
    });
    listing.publish();
    expect(listing.commercialSnapshot()).toMatchObject({
      shortDescription: "Quick benefit",
      longDescription: "Full details",
    });
  });

  it("defaults visibility to public and validates optional compare-at prices", () => {
    const publicListing = create();
    expect(publicListing.visibility).toBe("public");
    expect(publicListing.compareAtPrice).toBeNull();

    const discounted = Listing.create({
      id: "discounted",
      sellerId: "seller",
      title: "Discounted",
      shortDescription: "Summary",
      longDescription: "Details",
      price: Money.of(2000n, "USD"),
      compareAtPrice: Money.of(10000n, "USD"),
      destination: "https://example.com",
      visibility: "authenticated",
    });
    expect(discounted.visibility).toBe("authenticated");
    expect(discounted.compareAtPrice?.minorAmount).toBe(10000n);

    const freeWithReferencePrice = Listing.create({
      id: "free-discounted",
      sellerId: "seller",
      title: "Free",
      shortDescription: "Summary",
      longDescription: "Details",
      price: Money.of(0n, "USD"),
      compareAtPrice: Money.of(1000n, "USD"),
      destination: "https://example.com",
    });
    expect(freeWithReferencePrice.price.minorAmount).toBe(0n);
    expect(freeWithReferencePrice.compareAtPrice?.minorAmount).toBe(1000n);

    for (const amount of [2000n, 1500n])
      expect(() =>
        Listing.create({
          id: `invalid-${amount}`,
          sellerId: "seller",
          title: "Invalid comparison",
          shortDescription: "Summary",
          longDescription: "Details",
          price: Money.of(2000n, "USD"),
          compareAtPrice: Money.of(amount, "USD"),
          destination: "https://example.com",
        }),
      ).toThrow("Compare-at price must be greater than the listing price");

    expect(() =>
      Listing.create({
        id: "invalid-visibility",
        sellerId: "seller",
        title: "Invalid visibility",
        shortDescription: "Summary",
        longDescription: "Details",
        price: Money.of(100n, "USD"),
        destination: "https://example.com",
        visibility: "private" as never,
      }),
    ).toThrow("Listing visibility must be public or authenticated");
  });

  it("keeps category assignments normalized and removes legacy metadata category", () => {
    const listing = Listing.create({
      id: "categorized",
      sellerId: "seller",
      title: "Categorized",
      shortDescription: "Summary",
      longDescription: "Details",
      price: Money.of(100n, "USD"),
      destination: "https://example.com",
      metadata: { category: "legacy", fixture: true },
      categories: [
        { id: "b", name: "Toolkit", slug: "toolkit" },
        { id: "a", name: "API", slug: "api" },
      ],
    });
    expect(listing.metadata).toEqual({ fixture: true });
    expect(listing.categories.map((category) => category.name)).toEqual(["API", "Toolkit"]);
  });
});
