import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilesystemObjectStorageProvider } from "@/providers/storage/filesystem/provider";
import { SupabaseObjectStorageProvider } from "@/providers/storage/supabase/provider";
import { CloudflareR2ObjectStorageProvider } from "@/providers/storage/cloudflare-r2/provider";
import { ObjectStorageRegistry } from "@/modules/storage/object-storage";
describe("object storage providers used by listing media", () => {
  const roots: string[] = [];
  afterEach(async () => {
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  });
  it("stores browser-addressable filesystem objects and rejects traversal", async () => {
    const root = await mkdtemp(join(tmpdir(), "cliqero-media-"));
    roots.push(root);
    const provider = new FilesystemObjectStorageProvider(
      "local_public",
      root,
      "https://app.example/media/filesystem",
    );
    const stored = await provider.put({
      key: "listings/a/image.png",
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
    });
    expect(stored.provider).toBe("local_public");
    expect(provider.publicUrl(stored)).toBe(
      "https://app.example/media/filesystem/listings/a/image.png",
    );
    expect((await provider.read(stored)).bytes).toEqual(new Uint8Array([1, 2, 3]));
    await expect(
      provider.put({ key: "../secret", bytes: new Uint8Array([1]), mimeType: "image/png" }),
    ).rejects.toThrow("Unsafe object key");
  });
  it("keeps provider identity when the registry default changes", () => {
    const one = { name: "one", put: vi.fn(), delete: vi.fn(), publicUrl: () => "one" },
      two = { name: "two", put: vi.fn(), delete: vi.fn(), publicUrl: () => "two" };
    const registry = new ObjectStorageRegistry("two").register(one).register(two);
    expect(registry.default().name).toBe("two");
    expect(registry.publicUrl({ provider: "one", container: "c", key: "k" })).toBe("one");
  });
  it("supports multiple instances of the same driver and blocks private URLs", async () => {
    const firstRoot = await mkdtemp(join(tmpdir(), "cliqero-media-one-"));
    const secondRoot = await mkdtemp(join(tmpdir(), "cliqero-media-two-"));
    roots.push(firstRoot, secondRoot);
    const first = new FilesystemObjectStorageProvider(
        "public_one",
        firstRoot,
        "https://app.example/media/public_one",
        "media",
        "public",
      ),
      second = new FilesystemObjectStorageProvider(
        "private_two",
        secondRoot,
        undefined,
        "evidence",
        "private",
      );
    const registry = new ObjectStorageRegistry("public_one")
      .register("public_one", first)
      .register("private_two", second);
    const stored = await registry.get("private_two").put({
      key: "receipt.png",
      bytes: new Uint8Array([1]),
      mimeType: "image/png",
    });

    expect(stored.provider).toBe("private_two");
    expect(registry.default().name).toBe("public_one");
    expect(() => registry.publicUrl(stored)).toThrow("private");
    expect(first.publicUrl(stored)).toContain("https://app.example/media/public_one/");
  });
  it("allows Supabase and R2 drivers to have independent instance identities", () => {
    const transport = vi.fn(async () => new Response(null, { status: 200 }));
    const registry = new ObjectStorageRegistry("supabase_one")
      .register(
        "supabase_one",
        new SupabaseObjectStorageProvider(
          "supabase_one",
          "https://project.supabase.co",
          "media-one",
          "secret",
          "public",
          transport as typeof fetch,
        ),
      )
      .register(
        "supabase_two",
        new SupabaseObjectStorageProvider(
          "supabase_two",
          "https://project.supabase.co",
          "media-two",
          "secret",
          "private",
          transport as typeof fetch,
        ),
      )
      .register(
        "r2_one",
        new CloudflareR2ObjectStorageProvider(
          "r2_one",
          "https://account.r2.cloudflarestorage.com",
          "media-one",
          "https://media.example",
          "id",
          "secret",
          "public",
          transport as typeof fetch,
        ),
      )
      .register(
        "r2_two",
        new CloudflareR2ObjectStorageProvider(
          "r2_two",
          "https://account.r2.cloudflarestorage.com",
          "private-media",
          undefined,
          "id",
          "secret",
          "private",
          transport as typeof fetch,
        ),
      );

    expect(registry.names()).toEqual(["supabase_one", "supabase_two", "r2_one", "r2_two"]);
    expect(registry.get("supabase_two").visibility).toBe("private");
    expect(() =>
      registry.get("supabase_two").publicUrl!({
        provider: "supabase_two",
        container: "media-two",
        key: "private.png",
      }),
    ).toThrow("not publicly addressable");
  });
  it("uses mocked Supabase and R2 provider boundaries", async () => {
    const transport = vi.fn(async () => new Response(null, { status: 200 }));
    const supabase = new SupabaseObjectStorageProvider(
      "supabase_public",
      "https://project.supabase.co",
      "media",
      "secret",
      "public",
      transport as typeof fetch,
    );
    await supabase.put({
      key: "listings/a.png",
      bytes: new Uint8Array([1]),
      mimeType: "image/png",
    });
    expect(
      supabase.publicUrl({ provider: "supabase", container: "media", key: "listings/a.png" }),
    ).toContain("/object/public/media/");
    const r2 = new CloudflareR2ObjectStorageProvider(
      "r2_public",
      "https://account.r2.cloudflarestorage.com",
      "media",
      "https://media.example",
      "id",
      "secret",
      "public",
      transport as typeof fetch,
    );
    await r2.put({ key: "listings/a.png", bytes: new Uint8Array([1]), mimeType: "image/png" });
    expect(
      r2.publicUrl({ provider: "cloudflare-r2", container: "media", key: "listings/a.png" }),
    ).toBe("https://media.example/listings/a.png");
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("treats provider not-found deletion as converged success", async () => {
    const transport = vi.fn(async () => new Response(null, { status: 404 }));
    const supabase = new SupabaseObjectStorageProvider(
      "supabase_private",
      "https://project.supabase.co",
      "media",
      "secret",
      "private",
      transport as typeof fetch,
    );
    const r2 = new CloudflareR2ObjectStorageProvider(
      "r2_private",
      "https://account.r2.cloudflarestorage.com",
      "media",
      "https://media.example",
      "id",
      "secret",
      "private",
      transport as typeof fetch,
    );
    await expect(
      supabase.delete({ provider: "supabase", container: "media", key: "missing.png" }),
    ).resolves.toBeUndefined();
    await expect(
      r2.delete({ provider: "cloudflare-r2", container: "media", key: "missing.png" }),
    ).resolves.toBeUndefined();
    expect(() =>
      supabase.publicUrl({ provider: "supabase_private", container: "media", key: "private.png" }),
    ).toThrow("not publicly addressable");
    expect(() =>
      r2.publicUrl({ provider: "r2_private", container: "media", key: "private.png" }),
    ).toThrow("not publicly addressable");
  });
});
