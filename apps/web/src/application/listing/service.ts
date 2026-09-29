import { newId, type Id } from "@/kernel/ids";
import { Listing, type ListingMetadata, type ListingRepository } from "@/modules/listing";
import { Money } from "@/modules/money/money";
import type { ListingVisibility, ListingCategorySummary } from "@/modules/listing";
import type { ListingCategoryService } from "@/application/listing/category/service";
import type { Account } from "@/modules/identity/account";
import { AuthorizationPolicy } from "@/modules/identity/authorization";
import type { ListingMedia } from "@/modules/listing/media/media";
import type { ListingMediaService } from "@/application/listing/media";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { RatingSummary } from "@/modules/listing/reviews/review";
import type { AuditRecorder } from "@/application/shared/audit";

export class ListingService {
  constructor(
    private readonly listings: ListingRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly auditRecorder?: AuditRecorder,
    private readonly uow?: UnitOfWork,
    private readonly categoryService?: ListingCategoryService,
  ) {}
  async create(
    seller: Account,
    input: {
      title: string;
      shortDescription: string;
      longDescription: string;
      priceMinor: string;
      currency: string;
      destination: string;
      metadata?: ListingMetadata;
      externalKey?: string | null;
      featuredPosition?: number | null;
      compareAtPriceMinor?: string | null;
      visibility?: ListingVisibility;
      categoryIds?: readonly string[];
    },
  ) {
    if (input.currency.trim().toUpperCase() !== "USD")
      throw new Error("Listings must use the canonical USD currency");
    const categories = input.categoryIds ? await this.requireCategories(input.categoryIds) : [];
    const listing = Listing.create({
      id: newId(),
      sellerId: seller.id,
      title: input.title,
      shortDescription: input.shortDescription,
      longDescription: input.longDescription,
      price: Money.of(BigInt(input.priceMinor), input.currency),
      destination: input.destination,
      metadata: input.metadata,
      externalKey: input.externalKey,
      featuredPosition: input.featuredPosition,
      compareAtPrice:
        input.compareAtPriceMinor == null
          ? null
          : Money.of(BigInt(input.compareAtPriceMinor), input.currency),
      visibility: input.visibility,
      categories,
    });
    await this.listings.save(listing);
    return listing;
  }
  async createPublished(
    seller: Account,
    input: {
      title: string;
      shortDescription: string;
      longDescription: string;
      priceMinor: string;
      currency: string;
      destination: string;
      metadata?: ListingMetadata;
      featuredPosition?: number | null;
      externalKey?: string | null;
      compareAtPriceMinor?: string | null;
      visibility?: ListingVisibility;
      categoryIds?: readonly string[];
    },
  ) {
    const listing = await this.create(seller, input);
    return this.publish(seller, listing.id);
  }
  /** Catalogue-managed creation. The manager is an audit actor, not a seller/payee. */
  async createCatalogue(actor: Account, input: Parameters<ListingService["create"]>[1]) {
    return this.catalogueMutation(async () => {
      const listing = await this.create(actor, input);
      await this.audit(actor.id, "listing.created", listing.id, null, {
        state: listing.state,
        title: listing.title,
        price_minor: listing.price.minorAmount.toString(),
        currency: listing.price.currency,
      });
      return listing;
    });
  }
  async update(
    actor: Account,
    id: Id,
    input: {
      title?: string;
      shortDescription?: string;
      longDescription?: string;
      priceMinor?: string;
      currency?: string;
      destination?: string;
      metadata?: ListingMetadata;
      featuredPosition?: number | null;
      compareAtPriceMinor?: string | null;
      visibility?: ListingVisibility;
      categoryIds?: readonly string[];
    },
  ) {
    const listing = await this.listings.findById(id);
    if (!listing) throw new Error("Listing not found");
    if (!this.authorization.canModifyListing(actor, listing)) throw new Error("Forbidden");
    if (input.currency !== undefined && input.currency.trim().toUpperCase() !== "USD")
      throw new Error("Listings must use the canonical USD currency");
    const categories =
      input.categoryIds === undefined
        ? listing.categories
        : await this.requireCategories(input.categoryIds);
    listing.update({
      title: input.title ?? listing.title,
      shortDescription: input.shortDescription ?? listing.shortDescription,
      longDescription: input.longDescription ?? listing.longDescription,
      price: Money.of(
        BigInt(input.priceMinor ?? listing.price.minorAmount.toString()),
        input.currency ?? listing.price.currency,
      ),
      destination: input.destination ?? listing.destination,
      metadata: input.metadata ?? listing.metadata,
      featuredPosition: input.featuredPosition ?? listing.featuredPosition,
      compareAtPrice:
        input.compareAtPriceMinor === undefined
          ? listing.compareAtPrice
          : input.compareAtPriceMinor === null
            ? null
            : Money.of(BigInt(input.compareAtPriceMinor), input.currency ?? listing.price.currency),
      visibility: input.visibility,
      categories,
    });
    await this.listings.save(listing);
    return listing;
  }
  async updateCatalogue(_actor: Account, id: Id, input: Parameters<ListingService["update"]>[2]) {
    return this.catalogueMutation(async () => {
      const listing = await this.listings.findById(id);
      if (!listing) throw new Error("Listing not found");
      if (input.currency !== undefined && input.currency.trim().toUpperCase() !== "USD")
        throw new Error("Listings must use the canonical USD currency");
      const previous = {
        state: listing.state,
        title: listing.title,
        price_minor: listing.price.minorAmount.toString(),
        currency: listing.price.currency,
      };
      const categories =
        input.categoryIds === undefined
          ? listing.categories
          : await this.requireCategories(input.categoryIds);
      listing.update({
        title: input.title ?? listing.title,
        shortDescription: input.shortDescription ?? listing.shortDescription,
        longDescription: input.longDescription ?? listing.longDescription,
        price: Money.of(
          BigInt(input.priceMinor ?? listing.price.minorAmount.toString()),
          input.currency ?? listing.price.currency,
        ),
        destination: input.destination ?? listing.destination,
        metadata: input.metadata ?? listing.metadata,
        featuredPosition: input.featuredPosition ?? listing.featuredPosition,
        compareAtPrice:
          input.compareAtPriceMinor === undefined
            ? listing.compareAtPrice
            : input.compareAtPriceMinor === null
              ? null
              : Money.of(
                  BigInt(input.compareAtPriceMinor),
                  input.currency ?? listing.price.currency,
                ),
        visibility: input.visibility,
        categories,
      });
      await this.listings.save(listing);
      await this.audit(_actor.id, "listing.updated", listing.id, previous, {
        state: listing.state,
        title: listing.title,
        price_minor: listing.price.minorAmount.toString(),
        currency: listing.price.currency,
      });
      return listing;
    });
  }
  async publish(actor: Account, id: Id) {
    const listing = await this.owned(actor, id);
    listing.publish();
    await this.listings.save(listing);
    return listing;
  }
  async archive(actor: Account, id: Id) {
    const listing = await this.owned(actor, id);
    listing.archive();
    await this.listings.save(listing);
    return listing;
  }
  async restore(actor: Account, id: Id) {
    const listing = await this.owned(actor, id);
    listing.restore();
    await this.listings.save(listing);
    return listing;
  }
  async publishCatalogue(_actor: Account, id: Id) {
    return this.catalogueMutation(async () => {
      const listing = await this.listings.findById(id);
      if (!listing) throw new Error("Listing not found");
      const previous = { state: listing.state };
      listing.publish();
      await this.listings.save(listing);
      await this.audit(_actor.id, "listing.published", listing.id, previous, {
        state: listing.state,
      });
      return listing;
    });
  }
  async archiveCatalogue(_actor: Account, id: Id) {
    return this.catalogueMutation(async () => {
      const listing = await this.listings.findById(id);
      if (!listing) throw new Error("Listing not found");
      const previous = { state: listing.state };
      listing.archive();
      await this.listings.save(listing);
      if (previous.state !== listing.state)
        await this.audit(_actor.id, "listing.archived", listing.id, previous, {
          state: listing.state,
        });
      return listing;
    });
  }
  async restoreCatalogue(_actor: Account, id: Id) {
    return this.catalogueMutation(async () => {
      const listing = await this.listings.findById(id);
      if (!listing) throw new Error("Listing not found");
      const previous = { state: listing.state };
      listing.restore();
      await this.listings.save(listing);
      await this.audit(_actor.id, "listing.restored", listing.id, previous, {
        state: listing.state,
      });
      return listing;
    });
  }
  async bulkCatalogueState(
    actor: Account,
    action: "publish" | "archive" | "restore",
    ids: readonly Id[],
  ) {
    const results: Array<{ id: Id; success: true } | { id: Id; success: false; error: string }> =
      [];
    for (const id of ids) {
      try {
        if (action === "publish") await this.publishCatalogue(actor, id);
        else if (action === "archive") await this.archiveCatalogue(actor, id);
        else await this.restoreCatalogue(actor, id);
        results.push({ id, success: true });
      } catch (cause) {
        results.push({
          id,
          success: false,
          error: cause instanceof Error ? cause.message : "The listing could not be updated.",
        });
      }
    }
    return results;
  }
  async getCatalogue(id: Id) {
    const listing = await this.listings.findById(id);
    if (!listing) throw new Error("Listing not found");
    return listing;
  }
  async getOwner(actor: Account, id: Id) {
    return this.owned(actor, id);
  }
  queryPublic(input: {
    state?: never;
    search?: string;
    cursor?: string;
    limit: number;
    sort?: import("@/modules/listing").ListingSort;
    featuredOnly?: boolean;
  }) {
    return this.listings.query({ ...input, publicOnly: true, visibility: "public" });
  }
  queryStorefront(
    viewer: { kind: "anonymous" } | { kind: "authenticated" },
    input: {
      search?: string;
      cursor?: string;
      limit: number;
      sort?: import("@/modules/listing").ListingSort;
      featuredOnly?: boolean;
    },
  ) {
    return this.listings.query({
      ...input,
      publicOnly: true,
      visibility: viewer.kind === "anonymous" ? "public" : "all",
    });
  }
  queryOwner(
    actor: Account,
    input: {
      state?: import("@/modules/listing").ListingState;
      search?: string;
      cursor?: string;
      limit: number;
      sort?: import("@/modules/listing").ListingSort;
    },
  ) {
    return this.listings.query({ ...input, sellerId: actor.id });
  }
  queryCatalogue(input: {
    state?: import("@/modules/listing").ListingState;
    search?: string;
    cursor?: string;
    limit: number;
    sort?: import("@/modules/listing").ListingSort;
    visibility?: ListingVisibility;
  }) {
    return this.listings.query(input);
  }
  findByExternalKey(actor: Account, key: string) {
    return this.listings.findByExternalKey(actor.id, key);
  }
  async getPublic(id: Id) {
    const listing = await this.listings.findById(id);
    return listing?.state === "published" && listing.visibility === "public" ? listing : null;
  }
  async getAvailableTo(id: Id, viewer: { kind: "anonymous" } | { kind: "authenticated" }) {
    const listing = await this.listings.findById(id);
    if (!listing || listing.state !== "published") return null;
    return viewer.kind === "authenticated" || listing.visibility === "public" ? listing : null;
  }
  private async owned(actor: Account, id: Id) {
    const listing = await this.listings.findById(id);
    if (!listing) throw new Error("Listing not found");
    if (!this.authorization.canModifyListing(actor, listing)) throw new Error("Forbidden");
    return listing;
  }
  private async audit(
    actorId: string,
    action: string,
    subjectId: string,
    previousState: object | null,
    newState: object,
  ) {
    await this.auditRecorder?.record({
      actorId,
      action,
      subjectType: "listing",
      subjectId,
      previousState,
      newState,
    });
  }
  private async requireCategories(
    ids: readonly string[],
  ): Promise<readonly ListingCategorySummary[]> {
    if (!this.categoryService) {
      if (ids.length) throw new Error("Catalogue category service is unavailable");
      return [];
    }
    return this.categoryService.requireIds(ids);
  }
  private catalogueMutation<T>(operation: () => Promise<T>) {
    return this.uow ? this.uow.transaction(operation) : operation();
  }
}

export function listingView(listing: Listing) {
  return {
    id: listing.id,
    managed_by: listing.sellerId,
    title: listing.title,
    short_description: listing.shortDescription,
    long_description: listing.longDescription,
    price: { minor_amount: listing.price.minorAmount.toString(), currency: listing.price.currency },
    compare_at_price: listing.compareAtPrice
      ? {
          minor_amount: listing.compareAtPrice.minorAmount.toString(),
          currency: listing.compareAtPrice.currency,
        }
      : null,
    visibility: listing.visibility,
    categories: listing.categories,
    metadata: listing.metadata,
    state: listing.state,
    featured_position: listing.featuredPosition,
  };
}
export function ownerListingView(listing: Listing) {
  return {
    ...listingView(listing),
    destination: listing.destination,
    external_key: listing.externalKey,
  };
}
export function listingWithMediaView(
  listing: Listing,
  media: readonly ListingMedia[],
  service: ListingMediaService,
  owner = false,
  rating: RatingSummary | null = null,
) {
  return {
    ...(owner ? ownerListingView(listing) : listingView(listing)),
    media: media
      .filter((item) => item.state === "active")
      .map((item) => ({
        id: item.id,
        url: service.publicUrl(item),
        mime_type: item.mimeType,
        width: item.width,
        height: item.height,
        position: item.position,
        alt_text: item.altText,
      })),
    rating,
  };
}
