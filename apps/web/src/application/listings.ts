import { newId, type Id } from "@/kernel/ids";
import { Listing, type ListingMetadata, type ListingRepository } from "@/modules/listing/listing";
import { Money } from "@/modules/money/money";
import type { Account } from "@/modules/identity/account";
import { AuthorizationPolicy } from "@/modules/identity/authorization";
import type { ListingMedia } from "@/modules/listing-media/media";
import type { ListingMediaService } from "@/application/listing-media";
import type { SqlExecutor } from "@/infrastructure/postgres/database";
import type { UnitOfWork } from "@/kernel/unit-of-work";

export class ListingService {
  constructor(
    private readonly listings: ListingRepository,
    private readonly authorization: AuthorizationPolicy,
    private readonly sql?: SqlExecutor,
    private readonly uow?: UnitOfWork,
  ) {}
  async create(
    seller: Account,
    input: {
      title: string;
      description: string;
      priceMinor: string;
      currency: string;
      destination: string;
      metadata?: ListingMetadata;
      externalKey?: string | null;
    },
  ) {
    if (input.currency.trim().toUpperCase() !== "USD")
      throw new Error("Listings must use the canonical USD currency");
    const listing = Listing.create({
      id: newId(),
      sellerId: seller.id,
      title: input.title,
      description: input.description,
      price: Money.of(BigInt(input.priceMinor), input.currency),
      destination: input.destination,
      metadata: input.metadata,
      externalKey: input.externalKey,
    });
    await this.listings.save(listing);
    return listing;
  }
  async createPublished(
    seller: Account,
    input: {
      title: string;
      description: string;
      priceMinor: string;
      currency: string;
      destination: string;
      metadata?: ListingMetadata;
      externalKey?: string | null;
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
      description?: string;
      priceMinor?: string;
      currency?: string;
      destination?: string;
      metadata?: ListingMetadata;
    },
  ) {
    const listing = await this.listings.findById(id);
    if (!listing) throw new Error("Listing not found");
    if (!this.authorization.canModifyListing(actor, listing)) throw new Error("Forbidden");
    if (input.currency !== undefined && input.currency.trim().toUpperCase() !== "USD")
      throw new Error("Listings must use the canonical USD currency");
    listing.update({
      title: input.title ?? listing.title,
      description: input.description ?? listing.description,
      price: Money.of(
        BigInt(input.priceMinor ?? listing.price.minorAmount.toString()),
        input.currency ?? listing.price.currency,
      ),
      destination: input.destination ?? listing.destination,
      metadata: input.metadata ?? listing.metadata,
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
      listing.update({
        title: input.title ?? listing.title,
        description: input.description ?? listing.description,
        price: Money.of(
          BigInt(input.priceMinor ?? listing.price.minorAmount.toString()),
          input.currency ?? listing.price.currency,
        ),
        destination: input.destination ?? listing.destination,
        metadata: input.metadata ?? listing.metadata,
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
  async getCatalogue(id: Id) {
    const listing = await this.listings.findById(id);
    if (!listing) throw new Error("Listing not found");
    return listing;
  }
  async getOwner(actor: Account, id: Id) {
    return this.owned(actor, id);
  }
  queryPublic(input: { state?: never; search?: string; cursor?: string; limit: number }) {
    return this.listings.query({ ...input, publicOnly: true });
  }
  queryOwner(
    actor: Account,
    input: {
      state?: import("@/modules/listing/listing").ListingState;
      search?: string;
      cursor?: string;
      limit: number;
    },
  ) {
    return this.listings.query({ ...input, sellerId: actor.id });
  }
  queryCatalogue(input: {
    state?: import("@/modules/listing/listing").ListingState;
    search?: string;
    cursor?: string;
    limit: number;
  }) {
    return this.listings.query(input);
  }
  findByExternalKey(actor: Account, key: string) {
    return this.listings.findByExternalKey(actor.id, key);
  }
  findCatalogueByExternalKey(actor: Account, key: string) {
    return this.listings.findAnyByExternalKey
      ? this.listings.findAnyByExternalKey(key)
      : this.listings.findByExternalKey(actor.id, key);
  }
  async getPublic(id: Id) {
    const listing = await this.listings.findById(id);
    return listing?.state === "published" ? listing : null;
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
    await this.sql?.query(
      `insert into kernel.audit_records(actor_id,action,subject_type,subject_id,previous_state,new_state,correlation_id)
       values($1,$2,'listing',$3,$4::jsonb,$5::jsonb,gen_random_uuid())`,
      [
        actorId,
        action,
        subjectId,
        previousState ? JSON.stringify(previousState) : null,
        JSON.stringify(newState),
      ],
    );
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
    description: listing.description,
    price: { minor_amount: listing.price.minorAmount.toString(), currency: listing.price.currency },
    metadata: listing.metadata,
    state: listing.state,
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
  };
}
