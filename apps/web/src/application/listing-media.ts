import { newId } from "@/kernel/ids";
import type { Account } from "@/modules/identity/account";
import type { ListingRepository } from "@/modules/listing/listing";
import type { ListingMedia, ListingMediaRepository } from "@/modules/listing-media/media";
import { generatedObjectKey, ObjectStorageRegistry } from "@/modules/listing-media/storage";
import { inspectImage } from "@/modules/listing-media/image";
import type { UnitOfWork } from "@/kernel/unit-of-work";

export class ListingMediaService {
  constructor(
    private listings: ListingRepository,
    private media: ListingMediaRepository,
    private storage: ObjectStorageRegistry,
    private uow: UnitOfWork,
  ) {}
  async create(
    owner: Account,
    listingId: string,
    input: {
      bytes: Uint8Array;
      mimeType?: string;
      filename?: string;
      altText?: string;
      position?: number;
      transferIdentity?: string | null;
    },
    catalogue = false,
  ) {
    await this.owned(owner, listingId, catalogue);
    const image = inspectImage(input.bytes, input.mimeType);
    const id = newId(),
      provider = this.storage.default(),
      key = generatedObjectKey(listingId, id, image.mimeType);
    const stored = await provider.put({ key, bytes: input.bytes, mimeType: image.mimeType });
    const value: ListingMedia = {
      id,
      listingId,
      storageProvider: stored.provider,
      storageContainer: stored.container,
      objectKey: stored.key,
      mimeType: image.mimeType,
      originalFilename: safeFilename(input.filename),
      byteSize: BigInt(input.bytes.byteLength),
      width: image.width,
      height: image.height,
      position: 0,
      altText: (input.altText ?? "").trim().slice(0, 500),
      state: "active",
      createdAt: new Date(),
      transferIdentity: input.transferIdentity ?? null,
      deletionAttemptCount: 0,
    };
    try {
      await this.uow.transaction(async () => {
        await this.media.lockListing(listingId);
        const existing = (await this.media.listByListing(listingId)).filter(
            (item) => item.state === "active",
          ),
          position = Math.min(input.position ?? existing.length, existing.length);
        value.position = existing.length;
        await this.media.save(value);
        await this.media.reorderActive(
          listingId,
          insertAt(
            existing.map((item) => item.id),
            id,
            position,
          ),
        );
      });
      return (await this.media.findById(id))!;
    } catch (error) {
      try {
        await provider.delete(stored);
      } catch (cleanupError) {
        value.state = "deletion_pending";
        value.deletionRequestedAt = new Date();
        value.deletionNextAttemptAt = value.deletionRequestedAt;
        value.lastDeletionError = safeError(cleanupError);
        await this.media.save(value);
      }
      throw error;
    }
  }
  async list(owner: Account, listingId: string) {
    await this.owned(owner, listingId);
    return this.media.listByListing(listingId);
  }
  async get(owner: Account, listingId: string, id: string, catalogue = false) {
    await this.owned(owner, listingId, catalogue);
    return this.getUnchecked(listingId, id);
  }
  async update(
    owner: Account,
    listingId: string,
    id: string,
    input: { altText?: string; position?: number },
    catalogue = false,
  ) {
    await this.get(owner, listingId, id, catalogue);
    await this.uow.transaction(async () => {
      await this.media.lockListing(listingId);
      const value = await this.media.findById(id);
      if (!value || value.state !== "active") throw new Error("Only active media can be updated");
      if (input.altText !== undefined) value.altText = input.altText.trim().slice(0, 500);
      const active = (await this.media.listByListing(listingId)).filter(
          (item) => item.state === "active",
        ),
        position = input.position === undefined ? value.position : input.position;
      if (!Number.isSafeInteger(position) || position < 0)
        throw new Error("Media position is invalid");
      const ordered = active.map((item) => item.id).filter((item) => item !== id);
      await this.media.save(value);
      await this.media.reorderActive(
        listingId,
        insertAt(ordered, id, Math.min(position, ordered.length)),
      );
    });
    return (await this.media.findById(id))!;
  }
  async requestDeletion(owner: Account, listingId: string, id: string, catalogue = false) {
    await this.get(owner, listingId, id, catalogue);
    let value!: ListingMedia;
    await this.uow.transaction(async () => {
      await this.media.lockListing(listingId);
      value = (await this.media.findById(id))!;
      if (value.state === "deletion_pending") return;
      value.state = "deletion_pending";
      value.deletionRequestedAt = new Date();
      value.deletionNextAttemptAt = value.deletionRequestedAt;
      value.deletionAttemptCount = 0;
      value.deletionClaimedAt = null;
      value.deletionLeaseUntil = null;
      value.lastDeletionError = null;
      await this.media.save(value);
      const active = (await this.media.listByListing(listingId)).filter(
        (item) => item.state === "active",
      );
      await this.media.reorderActive(
        listingId,
        active.map((item) => item.id),
      );
    });
    return value;
  }
  async createCatalogue(
    actor: Account,
    listingId: string,
    input: Parameters<ListingMediaService["create"]>[2],
  ) {
    return this.create(actor, listingId, input, true);
  }
  async listCatalogue(actor: Account, listingId: string) {
    await this.owned(actor, listingId, true);
    return this.media.listByListing(listingId);
  }
  async getCatalogue(actor: Account, listingId: string, id: string) {
    await this.owned(actor, listingId, true);
    return this.getUnchecked(listingId, id);
  }
  async updateCatalogue(
    actor: Account,
    listingId: string,
    id: string,
    input: Parameters<ListingMediaService["update"]>[3],
  ) {
    return this.update(actor, listingId, id, input, true);
  }
  async requestDeletionCatalogue(actor: Account, listingId: string, id: string) {
    return this.requestDeletion(actor, listingId, id, true);
  }
  publicUrl(value: ListingMedia) {
    return this.storage.get(value.storageProvider).publicUrl({
      provider: value.storageProvider,
      container: value.storageContainer,
      key: value.objectKey,
    });
  }
  private async getUnchecked(listingId: string, id: string) {
    const value = await this.media.findById(id);
    if (!value || value.listingId !== listingId || value.state === "deleted")
      throw new Error("Listing media not found");
    return value;
  }
  private async owned(owner: Account, id: string, allowAny = false) {
    const listing = await this.listings.findById(id);
    if (!listing) throw new Error("Listing not found");
    if (!allowAny && listing.sellerId !== owner.id) throw new Error("Forbidden");
    return listing;
  }
}

export class ListingMediaDeletionProcessor {
  constructor(
    private media: ListingMediaRepository,
    private storage: ObjectStorageRegistry,
  ) {}
  findWork(limit = 50) {
    return this.media.claimDeletionWork(limit);
  }
  async process(id: string) {
    const value = await this.media.findById(id);
    if (!value || value.state !== "deletion_pending") return value;
    value.deletionAttemptedAt = new Date();
    value.deletionAttemptCount = (value.deletionAttemptCount ?? 0) + 1;
    try {
      await this.storage.get(value.storageProvider).delete({
        provider: value.storageProvider,
        container: value.storageContainer,
        key: value.objectKey,
      });
      value.state = "deleted";
      value.lastDeletionError = null;
      value.deletionNextAttemptAt = null;
    } catch (error) {
      value.lastDeletionError = safeError(error);
      value.deletionNextAttemptAt = new Date(
        value.deletionAttemptedAt.getTime() + deletionBackoffMs(value.deletionAttemptCount),
      );
    }
    value.deletionClaimedAt = null;
    value.deletionLeaseUntil = null;
    await this.media.save(value);
    return value;
  }
}

export function deletionBackoffMs(attempt: number) {
  return Math.min(60_000 * 2 ** Math.max(0, attempt - 1), 24 * 60 * 60_000);
}
const insertAt = (ids: string[], id: string, position: number) => {
  const copy = [...ids];
  copy.splice(position, 0, id);
  return copy;
};
const safeError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1000);
const safeFilename = (value?: string) =>
  value ? value.replace(/[\u0000-\u001f\\/]/g, "_").slice(0, 255) : null;
export function mediaView(value: ListingMedia, url: string) {
  return {
    id: value.id,
    listing_id: value.listingId,
    url,
    mime_type: value.mimeType,
    original_filename: value.originalFilename,
    byte_size: value.byteSize.toString(),
    width: value.width,
    height: value.height,
    position: value.position,
    alt_text: value.altText,
    state: value.state,
    created_at: value.createdAt.toISOString(),
  };
}
