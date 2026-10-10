import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadUploadsConfiguration, resolveCatalogueMediaProvider } from "@/config/uploads";
import {
  ObjectStorageRegistry,
  type ObjectStorageProvider,
} from "@/modules/storage/object-storage";
import { configurationEnvelope } from "./yaml-fixture";

function provider(name: string): ObjectStorageProvider {
  return {
    name,
    put: async () => ({
      provider: name,
      container: name,
      key: "key",
      byteSize: 1,
      mimeType: "image/png",
    }),
    delete: async () => undefined,
  };
}

async function withUploadsConfiguration<T>(parameters: string, operation: (path: string) => T) {
  const root = await mkdtemp(join(tmpdir(), "cliqero-uploads-config-"));
  try {
    const path = join(root, "uploads.yaml");
    await writeFile(path, configurationEnvelope(parameters));
    return operation(path);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("catalogue uploads configuration", () => {
  it("selects an explicitly configured named storage instance", async () => {
    await withUploadsConfiguration("catalogue:\n  media_provider: cloudflare", (path) => {
      const config = loadUploadsConfiguration(path);
      const storage = new ObjectStorageRegistry("filesystem")
        .register(provider("filesystem"))
        .register(provider("cloudflare"));

      expect(resolveCatalogueMediaProvider(config, storage).name).toBe("cloudflare");
    });
  });

  it("uses the global storage default when the provider is omitted", async () => {
    await withUploadsConfiguration("catalogue: {}", (path) => {
      const config = loadUploadsConfiguration(path);
      const storage = new ObjectStorageRegistry("cloudflare")
        .register(provider("filesystem"))
        .register(provider("cloudflare"));

      expect(resolveCatalogueMediaProvider(config, storage).name).toBe("cloudflare");
    });
  });

  it("rejects an explicitly named instance that is not configured", async () => {
    await withUploadsConfiguration("catalogue:\n  media_provider: missing", (path) => {
      const config = loadUploadsConfiguration(path);
      const storage = new ObjectStorageRegistry("filesystem").register(provider("filesystem"));

      expect(() => resolveCatalogueMediaProvider(config, storage)).toThrow(
        'Invalid uploads configuration: catalogue.media_provider "missing" is not configured in config/storage/media.yaml',
      );
    });
  });

  it("documents the configured instance in the tracked example", () => {
    expect(loadUploadsConfiguration("config/storage/uploads.example.yaml")).toEqual({
      catalogue: { media_provider: "filesystem" },
    });
  });
});
