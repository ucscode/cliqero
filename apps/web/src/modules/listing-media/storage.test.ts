import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilesystemObjectStorageProvider } from "@/providers/filesystem/storage/provider";
import { SupabaseObjectStorageProvider } from "@/providers/supabase/storage/provider";
import { CloudflareR2ObjectStorageProvider } from "@/providers/cloudflare-r2/storage/provider";
import { ObjectStorageRegistry } from "./storage";
describe("listing media storage providers", () => {
  const roots: string[] = [];
  afterEach(async () => {
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  });
  it("stores browser-addressable filesystem objects and rejects traversal", async () => {
    const root = await mkdtemp(join(tmpdir(), "cliqero-media-"));
    roots.push(root);
    const provider = new FilesystemObjectStorageProvider(
      root,
      "https://app.example/media/filesystem",
    );
    const stored = await provider.put({
      key: "listings/a/image.png",
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
    });
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
    expect(registry.get("one").publicUrl({ provider: "one", container: "c", key: "k" })).toBe(
      "one",
    );
  });
  it("uses mocked Supabase and R2 provider boundaries", async () => {
    const transport = vi.fn(async () => new Response(null, { status: 200 }));
    const supabase = new SupabaseObjectStorageProvider(
      "https://project.supabase.co",
      "media",
      "secret",
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
      "https://account.r2.cloudflarestorage.com",
      "media",
      "https://media.example",
      "id",
      "secret",
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
      "https://project.supabase.co",
      "media",
      "secret",
      transport as typeof fetch,
    );
    const r2 = new CloudflareR2ObjectStorageProvider(
      "https://account.r2.cloudflarestorage.com",
      "media",
      "https://media.example",
      "id",
      "secret",
      transport as typeof fetch,
    );
    await expect(
      supabase.delete({ provider: "supabase", container: "media", key: "missing.png" }),
    ).resolves.toBeUndefined();
    await expect(
      r2.delete({ provider: "cloudflare-r2", container: "media", key: "missing.png" }),
    ).resolves.toBeUndefined();
  });
});
