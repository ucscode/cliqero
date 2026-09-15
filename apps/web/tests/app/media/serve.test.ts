import { describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => fixtures.container,
}));

import { servePublicListingMedia } from "@/app/media/serve";

const media = {
  state: "active",
  storageContainer: "media",
  objectKey: "listings/listing/image.png",
  mimeType: "image/png",
  byteSize: 3n,
};

function configure(visibility: "public" | "private") {
  fixtures.container = {
    listingMediaRepository: {
      findByStorageProviderAndKey: vi.fn(async () => media),
    },
    objectStorage: {
      get: vi.fn(() => ({
        visibility,
        publicUrl: () => "https://media.example/object.png",
        read: vi.fn(async () => ({
          bytes: new Uint8Array([1, 2, 3]),
          mimeType: "image/png",
        })),
      })),
    },
  };
}

describe("public listing media serving", () => {
  it("serves active objects through their public instance identity", async () => {
    configure("public");
    const response = await servePublicListingMedia("local_public", media.objectKey);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(fixtures.container.objectStorage.get).toHaveBeenCalledWith("local_public");
  });

  it("does not serve objects from private instances", async () => {
    configure("private");

    await expect(
      servePublicListingMedia("payment_evidence", media.objectKey),
    ).resolves.toMatchObject({ status: 404 });
  });
});
