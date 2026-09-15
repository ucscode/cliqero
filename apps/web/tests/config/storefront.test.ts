import { describe, expect, it } from "vitest";
import { ObjectStorageRegistry } from "@/modules/storage/object-storage";
import { loadStorefrontConfiguration, resolveStorefrontMediaProvider } from "@/config/storefront";

describe("storefront configuration", () => {
  it("loads validated YAML storefront limits", () => {
    expect(loadStorefrontConfiguration("config/storefront.example.yaml")).toEqual({
      home: { featured_limit: 6 },
      catalogue: { page_size: 12 },
      reviews: { visible: true, page_size: 10 },
    });
  });

  it("accepts an optional named media instance", () => {
    expect(
      loadStorefrontConfiguration("config/storefront.example.yaml").media_provider,
    ).toBeUndefined();
  });

  it("resolves an explicit public instance and rejects a private one", () => {
    const provider = (name: string, visibility: "public" | "private") => ({
      name,
      visibility,
      put: async () => ({
        provider: name,
        container: "media",
        key: "key",
        byteSize: 1,
        mimeType: "image/png",
      }),
      delete: async () => undefined,
      publicUrl: () => "https://media.example/key",
    });
    const storage = new ObjectStorageRegistry("default_public")
      .register(provider("default_public", "public"))
      .register(provider("storefront_public", "public"))
      .register(provider("private_media", "private"));
    const config = loadStorefrontConfiguration("config/storefront.example.yaml");

    expect(resolveStorefrontMediaProvider(config, storage).name).toBe("default_public");
    expect(
      resolveStorefrontMediaProvider({ ...config, media_provider: "storefront_public" }, storage)
        .name,
    ).toBe("storefront_public");
    expect(() =>
      resolveStorefrontMediaProvider({ ...config, media_provider: "private_media" }, storage),
    ).toThrow("Storefront media storage must be public");
  });

  it("rejects a private default when storefront media falls back to it", () => {
    const provider = {
      name: "private_default",
      visibility: "private" as const,
      put: async () => ({
        provider: "private_default",
        container: "media",
        key: "key",
        byteSize: 1,
        mimeType: "image/png",
      }),
      delete: async () => undefined,
      publicUrl: () => "https://media.example/key",
    };
    const storage = new ObjectStorageRegistry("private_default").register(provider);

    expect(() =>
      resolveStorefrontMediaProvider(
        loadStorefrontConfiguration("config/storefront.example.yaml"),
        storage,
      ),
    ).toThrow("Storefront media storage must be public");
  });
});
