import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BlogService } from "@/application/blog/service";
import { SqliteBlogRepository } from "@/infrastructure/blog/repository";
import { closeBlogDatabaseForTests, getBlogDatabase } from "@/infrastructure/blog/database";

describe("BlogService SQLite capability", () => {
  let file: string;
  beforeEach(() => {
    file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cliqero-blog-")), "blog.sqlite");
    process.env.BLOG_DATABASE_PATH = file;
  });
  afterEach(() => {
    closeBlogDatabaseForTests();
    delete process.env.BLOG_DATABASE_PATH;
  });
  const input = (extra: Record<string, unknown> = {}) => ({
    title: "Hello Blog",
    excerpt: "A post",
    content: "# Hello\n\nSafe",
    status: "draft" as const,
    ...extra,
  });
  it("creates drafts, generates unique slugs, and publishes", () => {
    const service = new BlogService(new SqliteBlogRepository(getBlogDatabase().sqlite));
    const first = service.create(input(), "00000000-0000-4000-8000-000000000001", "k1");
    const second = service.create(input(), null, "k2");
    expect(first?.status).toBe("draft");
    expect(second?.slug).toBe("hello-blog-2");
    expect(service.get(first!.slug, true)).toBeNull();
    expect(service.publish(first!.id, true)?.status).toBe("published");
    expect(service.get(first!.slug, true)?.title).toBe("Hello Blog");
  });
  it("converges idempotent retries and rejects semantic conflicts", () => {
    const service = new BlogService(new SqliteBlogRepository(getBlogDatabase().sqlite));
    const first = service.create(input(), "00000000-0000-4000-8000-000000000001", "same");
    expect(service.create(input(), "00000000-0000-4000-8000-000000000001", "same")?.id).toBe(
      first?.id,
    );
    expect(() => service.create(input({ title: "Changed" }), null, "same")).toThrow(/Idempotency/);
    expect(() => service.create(input(), "00000000-0000-4000-8000-000000000002", "same")).toThrow(
      /Idempotency/,
    );
  });
  it("stores relational category and tags", () => {
    const service = new BlogService(new SqliteBlogRepository(getBlogDatabase().sqlite));
    const category = service.createCategory("Guides");
    const post = service.create(
      input({ category_id: category.id, tags: ["referrals", "marketing"] }),
      null,
    );
    expect(post?.category?.id).toBe(category.id);
    expect(post?.category?.slug).toBe("guides");
    expect(post?.tags.map((tag) => tag.name)).toEqual(["marketing", "referrals"]);
    expect(service.categories()).toHaveLength(1);
    expect(service.tags()).toHaveLength(2);
  });
  it("paginates published posts deterministically and excludes drafts", () => {
    const service = new BlogService(new SqliteBlogRepository(getBlogDatabase().sqlite));
    for (let i = 0; i < 5; i += 1)
      service.create(input({ title: `Published ${i}`, status: "published" }), null);
    service.create(input({ title: "Draft only" }), null);
    const first = service.list({ publishedOnly: true, limit: 2 });
    const second = service.list({
      publishedOnly: true,
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(first.limit).toBe(2);
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(2);
    expect(second.items.map((post) => post.id)).not.toEqual(first.items.map((post) => post.id));
    expect(first.items.every((post) => post.status === "published")).toBe(true);
    expect(
      service.list({ publishedOnly: true, limit: 2, cursor: "not-a-cursor" }).items,
    ).toHaveLength(2);
  });
  it("paginates category and tag-filtered published posts", () => {
    const service = new BlogService(new SqliteBlogRepository(getBlogDatabase().sqlite));
    const guides = service.createCategory("Guides");
    const other = service.createCategory("Other");
    for (let i = 0; i < 3; i += 1)
      service.create(
        input({
          title: `Guide ${i}`,
          status: "published",
          category_id: guides.id,
          tags: ["launch"],
        }),
        null,
      );
    service.create(
      input({ title: "Other", status: "published", category_id: other.id, tags: ["other"] }),
      null,
    );
    const categoryFirst = service.list({ publishedOnly: true, category: "guides", limit: 1 });
    const categorySecond = service.list({
      publishedOnly: true,
      category: "guides",
      limit: 1,
      cursor: categoryFirst.nextCursor ?? undefined,
    });
    const tagFirst = service.list({ publishedOnly: true, tag: "launch", limit: 1 });
    const tagSecond = service.list({
      publishedOnly: true,
      tag: "launch",
      limit: 1,
      cursor: tagFirst.nextCursor ?? undefined,
    });
    expect(categoryFirst.items[0]?.category?.slug).toBe("guides");
    expect(categorySecond.items[0]?.category?.slug).toBe("guides");
    expect(tagFirst.items[0]?.tags.some((tag) => tag.slug === "launch")).toBe(true);
    expect(tagSecond.items[0]?.tags.some((tag) => tag.slug === "launch")).toBe(true);
  });

  it("manages categories and refuses to delete one still assigned to a post", () => {
    const service = new BlogService(new SqliteBlogRepository(getBlogDatabase().sqlite));
    const category = service.createCategory("Engineering");
    expect(() => service.createCategory("Engineering")).toThrow(/already exists/);
    const updated = service.updateCategory(category.id, "Engineering Notes");
    expect(updated.slug).toBe("engineering-notes");
    const post = service.create(input({ category_id: updated.id }), null);
    expect(post?.category?.id).toBe(updated.id);
    expect(() => service.deleteCategory(updated.id)).toThrow(/assigned to one or more articles/);
    expect(() =>
      service.create(input({ category_id: "00000000-0000-4000-8000-000000000099" }), null),
    ).toThrow(/selected blog category no longer exists/);
    service.delete(post!.id);
    service.deleteCategory(updated.id);
    expect(service.categories()).toHaveLength(0);
  });

  it("returns bounded per-record outcomes for explicit blog bulk actions", () => {
    const service = new BlogService(new SqliteBlogRepository(getBlogDatabase().sqlite));
    const first = service.create(input({ title: "First" }), null)!;
    const second = service.create(input({ title: "Second" }), null)!;
    expect(service.bulk([first.id, second.id], "publish", 2)).toEqual([
      { id: first.id, success: true },
      { id: second.id, success: true },
    ]);
    const missingId = "00000000-0000-4000-8000-000000000099";
    const mixed = service.bulk([first.id, missingId], "delete", 2);
    expect(mixed[0]).toMatchObject({ id: first.id, success: true });
    expect(mixed[1]).toMatchObject({ id: missingId, success: false });
    expect(() => service.bulk([first.id, first.id], "delete", 2)).toThrow(/unique/);
    expect(() => service.bulk([first.id, second.id], "delete", 1)).toThrow(/between 1 and 1/);
  });
});
