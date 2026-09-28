import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BlogService } from "@/application/blog/service";
import { SqliteBlogRepository } from "@/infrastructure/blog/repository";
import { closeBlogDatabaseForTests, getBlogDatabase } from "@/infrastructure/blog/database";

describe("BlogService SQLite capability", () => {
  let file: string;
  let service: BlogService;
  beforeEach(() => {
    file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cliqero-blog-")), "blog.sqlite");
    process.env.BLOG_DATABASE_PATH = file;
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
    desired_status: "draft" as const,
    ...extra,
  });

  it("saves new content as a private working revision and only publishes on explicit promotion", () => {
    const first = service.create(input(), "00000000-0000-4000-8000-000000000001", "k1")!;
    const second = service.create(input(), null, "k2")!;
    expect(first.publicationStatus).toBe("draft");
    expect(first.hasWorkingRevision).toBe(true);
    expect(second.slug).toBe("hello-blog-2");
    expect(service.get(first.slug, true)).toBeNull();
    expect(service.publish(first.id)).toMatchObject({
      publicationStatus: "published",
      hasWorkingRevision: false,
    });
    expect(service.get(first.slug, true)?.title).toBe("Hello Blog");
  });

  it("keeps the live revision while edits are saved and previewed, then atomically promotes the working revision", () => {
    const original = service.create(input({ desired_status: "published" }), null)!;
    expect(original.publicationStatus).toBe("draft");
    service.publish(original.id);
    const publicBefore = service.get(original.slug, true)!;

    const edited = service.save(
      original.id,
      {
        title: "Revised title",
        content: "## New version",
        tags: ["new-tag"],
      },
      "00000000-0000-4000-8000-000000000001",
    );
    const working = service.getWorkingRevision(original.id)!;
    expect(edited.hasWorkingRevision).toBe(true);
    expect(working.title).toBe("Revised title");
    expect(service.get(original.slug, true)?.revisionId).toBe(publicBefore.revisionId);
    expect(service.get(original.slug, true)?.title).toBe("Hello Blog");
    expect(service.getRevision(original.id, working.revisionId)?.content).toBe("## New version");

    const promoted = service.applyStatus(original.id, "published");
    expect(promoted.hasWorkingRevision).toBe(false);
    expect(service.get(edited.slug, true)?.title).toBe("Revised title");
    expect(service.getRevision(original.id, publicBefore.revisionId)?.title).toBe("Hello Blog");
  });

  it("keeps working revisions when publication is withdrawn", () => {
    const post = service.create(input(), null)!;
    service.publish(post.id);
    const edited = service.save(post.id, { title: "Working edit" }, null);
    const workingRevisionId = edited.revisionId;
    const unpublished = service.unpublish(post.id);
    expect(unpublished.publicationStatus).toBe("draft");
    expect(unpublished.hasWorkingRevision).toBe(true);
    expect(service.get(post.slug, true)).toBeNull();
    expect(service.getWorkingRevision(post.id)?.revisionId).toBe(workingRevisionId);
  });

  it("retains the old live and working revisions when publication promotion fails", () => {
    const post = service.create(input(), null)!;
    service.publish(post.id);
    const publishedRevision = service.get(post.id, true)!.revisionId;
    const working = service.save(post.id, { title: "Not live yet" }, null);
    const sqlite = getBlogDatabase().sqlite;
    sqlite.exec(`create trigger fail_blog_promotion before update of publication_state on blog_posts
      when new.publication_state = 'published' begin select raise(abort, 'simulated publish failure'); end`);
    expect(() => service.publish(post.id)).toThrow(/simulated publish failure/);
    expect(service.get(post.id, true)?.revisionId).toBe(publishedRevision);
    expect(service.getWorkingRevision(post.id)?.revisionId).toBe(working.revisionId);
    expect(service.get(post.id)?.title).toBe("Not live yet");
  });

  it("converges idempotent retries and rejects semantic conflicts", () => {
    const first = service.create(input(), "00000000-0000-4000-8000-000000000001", "same");
    expect(service.create(input(), "00000000-0000-4000-8000-000000000001", "same")?.id).toBe(
      first?.id,
    );
    expect(() => service.create(input({ title: "Changed" }), null, "same")).toThrow(/Idempotency/);
    expect(() => service.create(input(), "00000000-0000-4000-8000-000000000002", "same")).toThrow(
      /Idempotency/,
    );
  });

  it("stores category and tags on the revision snapshot", () => {
    const category = service.createCategory("Guides");
    const post = service.create(
      input({ category_id: category.id, tags: ["referrals", "marketing"] }),
      null,
    )!;
    expect(post.category).toMatchObject({ id: category.id, slug: "guides" });
    expect(post.tags.map((tag) => tag.name)).toEqual(["marketing", "referrals"]);
    expect(service.categories()).toHaveLength(1);
    expect(service.tags()).toHaveLength(2);
  });

  it("paginates published posts deterministically and excludes drafts and pending edits", () => {
    for (let i = 0; i < 5; i += 1) {
      const post = service.create(input({ title: `Published ${i}` }), null)!;
      service.publish(post.id);
    }
    service.create(input({ title: "Draft only" }), null);
    const firstPost = service.list({ publishedOnly: true, limit: 2 });
    const secondPage = service.list({
      publishedOnly: true,
      limit: 2,
      cursor: firstPost.nextCursor ?? undefined,
    });
    expect(firstPost.limit).toBe(2);
    expect(firstPost.items).toHaveLength(2);
    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.items.map((post) => post.id)).not.toEqual(
      firstPost.items.map((post) => post.id),
    );
    expect(firstPost.items.every((post) => post.publicationStatus === "published")).toBe(true);
    const existing = firstPost.items[0]!;
    service.save(existing.id, { title: "Pending edit" }, null);
    expect(service.get(existing.id, true)?.title).not.toBe("Pending edit");
    expect(
      service.list({ publishedOnly: true, limit: 2, cursor: "not-a-cursor" }).items,
    ).toHaveLength(2);
  });

  it("paginates category and tag-filtered published revisions", () => {
    const guides = service.createCategory("Guides");
    const other = service.createCategory("Other");
    for (let i = 0; i < 3; i += 1) {
      const post = service.create(
        input({ title: `Guide ${i}`, category_id: guides.id, tags: ["launch"] }),
        null,
      )!;
      service.publish(post.id);
    }
    const otherPost = service.create(
      input({ title: "Other", category_id: other.id, tags: ["other"] }),
      null,
    )!;
    service.publish(otherPost.id);
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

  it("generates category slugs and supports explicit stable slug edits with conflicts", () => {
    const category = service.createCategory("Mara & Klara");
    const explicit = service.createCategory("Guides", "help-center");
    expect(category.slug).toBe("mara-and-klara");
    expect(explicit.slug).toBe("help-center");
    const renamed = service.updateCategory(category.id, { name: "New Guides" });
    expect(renamed.slug).toBe("mara-and-klara");
    expect(service.updateCategory(category.id, { slug: "editorial-guides" }).slug).toBe(
      "editorial-guides",
    );
    expect(() => service.createCategory("Duplicate", "help-center")).toThrow(/slug already exists/);
    expect(() => service.createCategory("Guides")).toThrow(/name already exists/);
    expect(() => service.createCategory("guides")).toThrow(/name already exists/);
    expect(() => service.createCategory("Bad slug", "Bad Slug")).toThrow();
    expect(() => service.updateCategory(category.id, { slug: "help-center" })).toThrow(
      /slug already exists/,
    );
  });

  it("refuses to delete categories referenced by any immutable revision", () => {
    const category = service.createCategory("Engineering");
    const post = service.create(input({ category_id: category.id }), null)!;
    expect(() => service.deleteCategory(category.id)).toThrow(/assigned to one or more articles/);
    expect(() =>
      service.create(input({ category_id: "00000000-0000-4000-8000-000000000099" }), null),
    ).toThrow(/Blog category not found/);
    service.delete(post.id);
    service.deleteCategory(category.id);
    expect(service.categories()).toHaveLength(0);
  });

  it("returns bounded per-record bulk outcomes and promotes working versions only", () => {
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
