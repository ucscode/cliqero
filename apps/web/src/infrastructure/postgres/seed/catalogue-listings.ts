import type { ListingService } from "@/application/listing/service";
import type { Account } from "@/modules/identity/account";

export const FREE_CATALOGUE_LISTINGS = [
  {
    externalKey: "toolkit-10",
    title: "Product discovery cards",
    shortDescription: "Printable prompts for practical product discovery.",
    longDescription:
      "A practical set of prompts for planning and running product discovery. Use the cards to frame a question, compare what you already know, and choose a useful next conversation.",
    destination: "https://example.test/catalogue/toolkit-10",
  },
  {
    externalKey: "toolkit-12",
    title: "Launch checklist",
    shortDescription: "A short checklist for a confident launch.",
    longDescription:
      "A concise, reusable checklist for preparing a thoughtful product launch. Review the audience, key messages, support plan, and follow-up before you publish.",
    destination: "https://example.test/catalogue/toolkit-12",
  },
] as const;

/** Seeds useful free catalogue resources using the normal listing domain/service rules. */
export class CatalogueListingSeeder {
  constructor(private readonly listings: ListingService) {}

  async seedFree(actor: Account, toolkitCategoryId?: string) {
    const seeded = [];
    for (const fixture of FREE_CATALOGUE_LISTINGS) {
      const input = {
        ...fixture,
        priceMinor: "0",
        currency: "USD",
        metadata: { fixture: true },
        ...(toolkitCategoryId ? { categoryIds: [toolkitCategoryId] } : {}),
        compareAtPriceMinor: fixture.externalKey === "toolkit-10" ? "1000" : null,
      };
      const existing = await this.listings.findByExternalKey(actor, fixture.externalKey);
      let listing = existing
        ? await this.listings.update(actor, existing.id, input)
        : await this.listings.createCatalogue(actor, input);

      if (listing.state !== "published")
        listing = await this.listings.update(actor, listing.id, { state: "published" });
      seeded.push(listing);
    }
    return seeded;
  }
}
