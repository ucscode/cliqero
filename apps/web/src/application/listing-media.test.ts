import { describe, expect, it, vi } from "vitest";
import { Account } from "@/modules/identity/account";
import {
  ObjectStorageRegistry,
  type ObjectStorageProvider,
} from "@/modules/storage/object-storage";
import type { ListingMedia } from "@/modules/listing/media/media";
import { ListingMediaDeletionProcessor, ListingMediaService } from "./listing-media";

const listingId = "00000000-0000-4000-8000-000000000001";
const owner = new Account("00000000-0000-4000-8000-000000000002", "owner", "NG");

function png() {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 2, 128], 16);
  bytes.set([0, 0, 1, 224], 20);
  return bytes;
}

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
    publicUrl: (locator) => `https://media.example/${locator.key}`,
  };
}

describe("listing media storage instance selection", () => {
  it("uploads new listing media to the selected public instance", async () => {
    const defaultProvider = storageProvider("default_public", "public");
    const storefrontProvider = storageProvider("storefront_public", "public");
    const registry = new ObjectStorageRegistry("default_public")
      .register(defaultProvider)
      .register(storefrontProvider);
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
      "storefront_public",
    );

    const media = await service.create(owner, listingId, {
      bytes: png(),
      mimeType: "image/png",
    });

    expect(media.storageProvider).toBe("storefront_public");
    expect((storefrontProvider.put as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect((defaultProvider.put as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect(service.publicUrl(media)).toContain("https://media.example/");
  });

  it("rejects a private selected storefront instance", () => {
    const registry = new ObjectStorageRegistry("private_media").register(
      storageProvider("private_media", "private"),
    );

    expect(
      () =>
        new ListingMediaService({} as never, {} as never, registry, {} as never, "private_media"),
    ).toThrow("Storefront media storage must be public");
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

    await new ListingMediaDeletionProcessor(
      { findById: async () => value, save: async () => undefined } as never,
      registry,
    ).process(value.id);

    expect(provider.delete).toHaveBeenCalledWith({
      provider: "legacy_filesystem",
      container: "media",
      key: "listings/listing/image.png",
    });
    expect(value.state).toBe("deleted");
  });
});
