import { describe, expect, it, vi } from "vitest";
import { Account } from "@/modules/identity/account";
import {
  ObjectStorageRegistry,
  type ObjectStorageProvider,
} from "@/modules/storage/object-storage";
import type { ListingMedia } from "@/modules/listing/media/media";
import { ListingMediaDeletionProcessor, ListingMediaService } from "@/application/listing/media";
import { resolveCatalogueMediaProvider } from "@/config/uploads";
import { fixturePng } from "@/infrastructure/postgres/seed/fixture-media";

const listingId = "00000000-0000-4000-8000-000000000001";
const owner = new Account("00000000-0000-4000-8000-000000000002", "owner", "NG");

function storageProvider(name: string, visibility: "public" | "private"): ObjectStorageProvider {
  return {
    name,
    visibility,
    put: vi.fn(async (input) => ({
      provider: name,
      container: "media",
      key: input.key,
      byteSize: input.bytes.byteLength,
      mimeType: input.mimeType,
    })),
    delete: vi.fn(async () => undefined),
    publicUrl: vi.fn((locator) => `https://media.example/${locator.key}`),
  };
}

describe("listing media storage instance selection", () => {
  it("uses the configured catalogue instance for seller and Operator uploads", async () => {
    const defaultProvider = storageProvider("default_public", "public");
    const catalogueProvider = storageProvider("catalogue_public", "public");
    const registry = new ObjectStorageRegistry("default_public")
      .register(defaultProvider)
      .register(catalogueProvider);
    let saved: any;
    const service = new ListingMediaService(
      { findById: async () => ({ sellerId: owner.id }) } as never,
      {
        lockListing: async () => undefined,
        listByListing: async () => [],
        save: async (value: ListingMedia) => {
          saved = value;
        },
        reorderActive: async () => undefined,
        findById: async () => saved,
      } as never,
      registry,
      { transaction: async (operation) => operation() },
      resolveCatalogueMediaProvider({ catalogue: { media_provider: "catalogue_public" } }, registry)
        .name,
    );

    const sellerMedia = await service.create(owner, listingId, {
      bytes: fixturePng(35, 120, 95),
      mimeType: "image/png",
    });
    const operatorMedia = await service.createCatalogue(owner, listingId, {
      bytes: fixturePng(35, 120, 95),
      mimeType: "image/png",
    });

    expect(sellerMedia.storageProvider).toBe("catalogue_public");
    expect(operatorMedia.storageProvider).toBe("catalogue_public");
    expect((catalogueProvider.put as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    expect((defaultProvider.put as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect(service.publicUrl(sellerMedia)).toContain("https://media.example/");
  });

  it("allows a private selected catalogue instance until public URL generation", () => {
    const registry = new ObjectStorageRegistry("private_media").register(
      storageProvider("private_media", "private"),
    );

    const service = new ListingMediaService(
      {} as never,
      {} as never,
      registry,
      {} as never,
      "private_media",
    );
    expect(() =>
      service.publicUrl({
        storageProvider: "private_media",
        storageContainer: "media",
        objectKey: "x",
      } as ListingMedia),
    ).toThrow("private");
  });

  it("deletes existing media through its persisted storage instance", async () => {
    const provider = storageProvider("legacy_filesystem", "public");
    const value = {
      id: "media-id",
      storageProvider: "legacy_filesystem",
      storageContainer: "media",
      objectKey: "listings/listing/image.png",
      state: "deletion_pending" as string,
      deletionAttemptCount: 0,
    };
    const registry = new ObjectStorageRegistry("legacy_filesystem").register(provider);

    const deleteById = vi.fn(async () => undefined);
    const result = await new ListingMediaDeletionProcessor(
      { findById: async () => value, save: async () => undefined, deleteById } as never,
      registry,
    ).process(value.id);

    expect(provider.delete).toHaveBeenCalledWith({
      provider: "legacy_filesystem",
      container: "media",
      key: "listings/listing/image.png",
    });
    expect(deleteById).toHaveBeenCalledWith(value.id);
    expect(result).toMatchObject({ id: value.id, state: "deleted" });
    expect(value.state).toBe("deletion_pending");
  });

  it("retrieves existing media URLs through the persisted provider identity", () => {
    const persistedProvider = storageProvider("historical_media", "public");
    const defaultProvider = storageProvider("new_default", "public");
    const registry = new ObjectStorageRegistry("new_default")
      .register(defaultProvider)
      .register(persistedProvider);
    const service = new ListingMediaService({} as never, {} as never, registry, {} as never);

    expect(
      service.publicUrl({
        storageProvider: "historical_media",
        storageContainer: "legacy-container",
        objectKey: "legacy/key.png",
      } as ListingMedia),
    ).toBe("https://media.example/legacy/key.png");
    expect(defaultProvider.publicUrl).not.toHaveBeenCalled();
  });
});
