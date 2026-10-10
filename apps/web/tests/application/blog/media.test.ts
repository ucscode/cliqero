import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlogMediaService } from "@/application/blog/media";
import { applyBlogMigrations } from "@/infrastructure/blog/migration-runner";
import { SqliteBlogMediaRepository } from "@/infrastructure/blog/media-repository";
import { SqliteBlogRepository } from "@/infrastructure/blog/repository";
import {
  ObjectStorageRegistry,
  type ObjectStorageProvider,
} from "@/modules/storage/object-storage";
import { fixturePng } from "@/infrastructure/postgres/seed/fixture-media";

const databases: Database.Database[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function fixture() {
  const database = new Database(":memory:");
  databases.push(database);
  database.pragma("foreign_keys = ON");
  applyBlogMigrations(database, path.resolve("src/infrastructure/blog/migrations"));
  const repository = new SqliteBlogMediaRepository(database);
  const provider: ObjectStorageProvider = {
    name: "blog-images",
    visibility: "public",
    put: vi.fn(async ({ key, bytes, mimeType }) => ({
      provider: "blog-images",
      container: "media",
      key,
      byteSize: bytes.byteLength,
      mimeType,
    })),
    delete: vi.fn(async () => undefined),
    publicUrl: (locator) => `https://media.example/${locator.key}`,
    read: async () => ({ bytes: new Uint8Array(), mimeType: "image/png" }),
  };
  const storage = new ObjectStorageRegistry("blog-images").register(provider);
  return {
    database,
    repository,
    provider,
    service: new BlogMediaService(repository, storage, provider.name),
  };
}

describe("Blog featured media lifecycle", () => {
  it("validates, stores, and records the configured media identity", async () => {
    const { repository, provider, service } = fixture();
    const bytes = fixturePng(32, 120, 95);

    const result = await service.upload({
      ownerAccountId: "editor-1",
      bytes,
      mimeType: "image/png",
      origin: "https://cliqero.example",
    });

    const id = result.url.split("/").at(-1)!;
    expect(result.url).toBe(`https://cliqero.example/media/blog/${id}`);
    expect(provider.put).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "image/png", bytes }),
    );
    expect(repository.findById(id)).toMatchObject({
      ownerAccountId: "editor-1",
      postId: null,
      storageProvider: "blog-images",
      storageContainer: "media",
      mimeType: "image/png",
      state: "active",
    });
  });

  it("rejects a MIME mismatch before storing any bytes", async () => {
    const { provider, service } = fixture();
    await expect(
      service.upload({
        ownerAccountId: "editor-1",
        bytes: fixturePng(32, 120, 95),
        mimeType: "image/jpeg",
        origin: "https://cliqero.example",
      }),
    ).rejects.toThrow();
    expect(provider.put).not.toHaveBeenCalled();
  });

  it("removes discarded uploads but retains failed storage deletion work", async () => {
    const { repository, provider, service } = fixture();
    const uploaded = await service.upload({
      ownerAccountId: "editor-1",
      bytes: fixturePng(32, 120, 95),
      mimeType: "image/png",
      origin: "https://cliqero.example",
    });
    const id = uploaded.url.split("/").at(-1)!;

    expect(await service.discard(id, "another-editor")).toBe(false);
    expect(repository.findById(id)?.state).toBe("active");
    await service.discard(id, "editor-1");
    expect(provider.delete).toHaveBeenCalledWith({
      provider: "blog-images",
      container: "media",
      key: `blog/${id}.png`,
    });
    expect(repository.findById(id)).toBeNull();

    vi.mocked(provider.delete).mockRejectedValueOnce(new Error("storage unavailable"));
    const retained = await service.upload({
      ownerAccountId: "editor-1",
      bytes: fixturePng(32, 120, 95),
      mimeType: "image/png",
      origin: "https://cliqero.example",
    });
    const retainedId = retained.url.split("/").at(-1)!;
    await service.discard(retainedId, "editor-1");
    expect(repository.findById(retainedId)?.state).toBe("deletion_pending");
  });

  it("lets another authorized editor save an article without reassigning its attached image", async () => {
    const { database, repository, service } = fixture();
    const blogRepository = new SqliteBlogRepository(database);
    database
      .prepare(
        `insert into blog_posts
          (id,slug,title,excerpt,content_markdown,status,created_at,updated_at)
         values('post-1','post','Post','','Body','draft',1,1)`,
      )
      .run();
    const uploaded = await service.upload({
      ownerAccountId: "original-editor",
      bytes: fixturePng(32, 120, 95),
      mimeType: "image/png",
      origin: "https://cliqero.example",
    });
    const id = uploaded.url.split("/").at(-1)!;

    blogRepository.syncFeaturedMedia("post-1", "original-editor", uploaded.url);
    expect(() =>
      blogRepository.syncFeaturedMedia("post-1", "current-editor", uploaded.url),
    ).not.toThrow();
    expect(repository.findById(id)).toMatchObject({
      postId: "post-1",
      ownerAccountId: "original-editor",
    });
  });
});
