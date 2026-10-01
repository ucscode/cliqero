import { newId, type Id } from "@/kernel/ids";
import {
  Listing,
  type ListingMetadata,
  type ListingRepository,
  type ListingState,
} from "@/modules/listing";
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
import { PublicApplicationError } from "@/kernel/errors";

export class ListingService {
  constructor(
    private readonly listings: ListingRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly auditRecorder?: AuditRecorder,
    private readonly uow?: UnitOfWork,
    private readonly categoryService?: ListingCategoryService,
    private readonly integrationRevoker?: { revokeAllForListing(listingId: Id): Promise<void> },
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
  async createCatalogue(
    actor: Account,
    input: Parameters<ListingService["create"]>[1] & { state?: ListingState },
  ) {
    return this.catalogueMutation(async () => {
      const { state = "draft", ...listingInput } = input;
      const listing = await this.create(actor, listingInput);
      this.applyCatalogueState(listing, state);
      if (state !== "draft") await this.listings.save(listing);
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
      featuredPosition:
        input.featuredPosition === undefined ? listing.featuredPosition : input.featuredPosition,
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
  async updateCatalogue(
    _actor: Account,
    id: Id,
    input: Parameters<ListingService["update"]>[2] & { state?: ListingState },
  ) {
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
        featuredPosition:
          input.featuredPosition === undefined ? listing.featuredPosition : input.featuredPosition,
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
      if (input.state !== undefined) this.applyCatalogueState(listing, input.state);
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
  async deleteCatalogue(actor: Account, id: Id) {
    return this.catalogueMutation(async () => {
      const listing = await this.listings.findById(id);
      if (!listing) throw new PublicApplicationError("Listing not found.", "not_found", 404);
      const deleted = await this.listings.delete(id);
      if (!deleted) throw new PublicApplicationError("Listing not found.", "not_found", 404);
      await this.integrationRevoker?.revokeAllForListing(id);
      await this.audit(
        actor.id,
        "listing.deleted",
        id,
        {
          state: listing.state,
          title: listing.title,
          price_minor: listing.price.minorAmount.toString(),
          currency: listing.price.currency,
        },
        { deleted: true },
      );
      return { id };
    });
  }
  async setCatalogueState(actor: Account, id: Id, state: "draft" | "published" | "archived") {
    if (state === "published") return this.publishCatalogue(actor, id);
    if (state === "archived") return this.archiveCatalogue(actor, id);
    return this.restoreCatalogue(actor, id);
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
    direction?: import("@/modules/listing").ListingSortDirection;
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
      direction?: import("@/modules/listing").ListingSortDirection;
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
      direction?: import("@/modules/listing").ListingSortDirection;
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
    direction?: import("@/modules/listing").ListingSortDirection;
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
  private applyCatalogueState(listing: Listing, state: ListingState) {
    if (listing.state === state) return;
    if (state === "archived") {
      listing.archive();
      return;
    }
    if (state === "draft") {
      if (listing.state === "published") listing.archive();
      if (listing.state === "archived") listing.restore();
      return;
    }
    if (listing.state === "archived") listing.restore();
    listing.publish();
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
