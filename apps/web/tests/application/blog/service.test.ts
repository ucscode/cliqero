import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BlogService } from "@/application/blog/service";
import { SqliteBlogRepository } from "@/infrastructure/blog/repository";
import { closeBlogDatabaseForTests, getBlogDatabase } from "@/infrastructure/blog/database";

describe("BlogService SQLite workflow", () => {
  let service: BlogService;
  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cliqero-blog-"));
    process.env.BLOG_DATABASE_PATH = path.join(dir, "blog.sqlite");
    service = new BlogService(new SqliteBlogRepository(getBlogDatabase().sqlite));
  });
  afterEach(() => {
    closeBlogDatabaseForTests();
    delete process.env.BLOG_DATABASE_PATH;
  });
  const input = (extra: Record<string, unknown> = {}) => ({
    title: "Hello Blog",
    excerpt: "A post",
    content: "## Hello\n\nSafe",
    ...extra,
  });

  it("saves canonical content and applies selected publication status only on Save", () => {
    const draft = service.create(input(), "account-1", "k1");
    expect(draft.status).toBe("draft");
    expect(service.get(draft.slug, true)).toBeNull();
    const published = service.save(
      draft.id,
      { title: "Published title", status: "published" },
      "account-1",
    )!;
    expect(published).toMatchObject({ title: "Published title", status: "published" });
    expect(service.get(published.slug, true)?.title).toBe("Published title");
    expect(service.save(published.id, { status: "draft" }, "account-1")?.status).toBe("draft");
  });
  it("keeps create idempotency and rejects key reuse with different input", () => {
    const first = service.create(input(), "account-1", "same");
    expect(service.create(input(), "account-1", "same").id).toBe(first.id);
    expect(() => service.create(input({ title: "Changed" }), "account-1", "same")).toThrow(
      /Idempotency/,
    );
  });
  it("assigns multiple categories, synchronizes replacements, and filters by any assigned category", () => {
    const guides = service.createCategory("Guides");
    const product = service.createCategory("Product");
    const other = service.createCategory("Other");
    const post = service.create(
      input({
        status: "published",
        category_ids: [guides.id, product.id],
        tags: ["referrals", "marketing"],
      }),
      null,
    );
    expect(post.categories.map((c) => c.id)).toEqual([guides.id, product.id]);
    expect(post.tags.map((t) => t.name)).toEqual(["marketing", "referrals"]);
    expect(
      service.list({ publishedOnly: true, category: "product" }).items.map((p) => p.id),
    ).toEqual([post.id]);
    expect(service.save(post.id, { category_ids: [other.id] }, null)?.categories).toEqual([other]);
    expect(() => service.deleteCategory(other.id)).toThrow(/assigned/);
    expect(service.list({ publishedOnly: true, category: "guides" }).items).toEqual([]);
  });
  it("paginates canonical published posts deterministically and excludes drafts", () => {
    for (let i = 0; i < 5; i++)
      service.create(input({ title: `Published ${i}`, status: "published" }), null);
    service.create(input({ title: "Draft only" }), null);
    const first = service.list({ publishedOnly: true, limit: 2 });
    const second = service.list({
      publishedOnly: true,
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(2);
    expect(
      second.items.map((p) => p.id).some((id) => first.items.some((item) => item.id === id)),
    ).toBe(false);
    expect([...first.items, ...second.items].every((p) => p.status === "published")).toBe(true);
  });
  it("sorts titles on the server-side repository and scopes cursors to the selected order", () => {
    for (const title of ["Zebra", "Alpha", "Delta", "Bravo", "Echo"])
      service.create(input({ title, status: "published" }), null);
    const first = service.list({ publishedOnly: true, sort: "title", direction: "asc", limit: 2 });
    expect(first.items.map((post) => post.title)).toEqual(["Alpha", "Bravo"]);
    expect(first.nextCursor).toBeTruthy();
    expect(() =>
      service.list({
        publishedOnly: true,
        sort: "created",
        direction: "desc",
        cursor: first.nextCursor ?? undefined,
        limit: 2,
      }),
    ).toThrow("Invalid or stale pagination cursor");
    const second = service.list({
      publishedOnly: true,
      sort: "title",
      direction: "asc",
      cursor: first.nextCursor ?? undefined,
      limit: 2,
    });
    expect(second.items.map((post) => post.title)).toEqual(["Delta", "Echo"]);
    expect(second.items.some((post) => first.items.some((item) => item.id === post.id))).toBe(
      false,
    );
  });
  it("creates and refreshes a private preview without mutating canonical posts", () => {
    const category = service.createCategory("Guides");
    const categoryTwo = service.createCategory("AI");
    const post = service.create(
      input({ title: "Canonical", status: "published", category_ids: [category.id] }),
      "owner",
    );
    const first = service.createPreview(
      input({ title: "Unsaved", content: "## New", category_ids: [category.id, categoryTwo.id] }),
      "owner",
    );
    const preview = service.getPreview(first.id, "owner")!;
    expect(first.url).toBe(`/blog/preview/${first.id}`);
    expect(preview.payload).toMatchObject({
      title: "Unsaved",
      content: "## New",
      categories: [categoryTwo, category],
    });
    expect(service.get(post.id, true)?.title).toBe("Canonical");
    const updated = service.createPreview(
      input({ title: "Latest unsaved", category_ids: [category.id] }),
      "owner",
      first.id,
    );
    expect(updated.id).toBe(first.id);
    expect(service.getPreview(first.id, "owner")?.payload.title).toBe("Latest unsaved");
    expect(getBlogDatabase().sqlite.prepare("select count(*) n from blog_previews").get()).toEqual({
      n: 1,
    });
  });
  it("previews a new published-form article without creating a canonical row", () => {
    const preview = service.createPreview(
      input({ title: "Not saved yet", status: "published" }),
      "owner",
    );
    expect(preview.id).toBeTruthy();
    expect(service.getPreview(preview.id, "owner")?.payload.title).toBe("Not saved yet");
    expect(getBlogDatabase().sqlite.prepare("select count(*) n from blog_posts").get()).toEqual({
      n: 0,
    });
  });
  it("isolates preview ownership, expires old snapshots, and invalidates incompatible JSON", () => {
    const preview = service.createPreview(input(), "owner");
    expect(service.getPreview(preview.id, "other")).toBeNull();
    const db = getBlogDatabase().sqlite;
    db.prepare("update blog_previews set expires_at=? where id=?").run(Date.now() - 1, preview.id);
    expect(service.getPreview(preview.id, "owner")).toBeNull();
    const stale = service.createPreview(input(), "owner");
    db.prepare("update blog_previews set payload_json=? where id=?").run("{broken", stale.id);
    expect(service.getPreview(stale.id, "owner")).toBeNull();
    expect(db.prepare("select id from blog_previews where id=?").get(stale.id)).toBeUndefined();
  });
  it("enforces category name and slug conflicts and preserves slugs when names change", () => {
    const category = service.createCategory("Mara & Klara");
    const explicit = service.createCategory("Guides", "help-center");
    expect(category.slug).toBe("mara-and-klara");
    expect(explicit.slug).toBe("help-center");
    expect(service.updateCategory(category.id, { name: "New Guides" }).slug).toBe("mara-and-klara");
    expect(service.updateCategory(category.id, { slug: "editorial-guides" }).slug).toBe(
      "editorial-guides",
    );
    expect(() => service.createCategory("guides")).toThrow(/name already exists/);
    expect(() => service.createCategory("Duplicate", "help-center")).toThrow(/slug already exists/);
    expect(() => service.createCategory("Bad slug", "Bad Slug")).toThrow();
  });
});
