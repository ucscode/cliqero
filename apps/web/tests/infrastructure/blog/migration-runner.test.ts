import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyBlogMigrations,
  blogMigrationDirectory,
} from "@/infrastructure/blog/migration-runner";

const databases: Database.Database[] = [];
const migrationDirectory = path.resolve("src/infrastructure/blog/migrations");

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

describe("Blog SQLite migrations", () => {
  it("resolves migrations from both development and standalone production roots", () => {
    expect(blogMigrationDirectory("/repo/apps/web")).toBe(
      "/repo/apps/web/src/infrastructure/blog/migrations",
    );
    expect(blogMigrationDirectory("/app")).toBe("/app/apps/web/src/infrastructure/blog/migrations");
  });

  it("applies ordered migrations and preserves legacy articles as revision one", () => {
    const db = new Database(":memory:");
    databases.push(db);
    db.pragma("foreign_keys = ON");
    db.exec(
      "create table blog_schema_migrations (id text primary key not null, applied_at integer not null)",
    );
    db.exec(fs.readFileSync(path.join(migrationDirectory, "0001_initial_blog_schema.sql"), "utf8"));
    db.prepare("insert into blog_schema_migrations(id,applied_at) values(?,?)").run(
      "0001_initial_blog_schema",
      1,
    );
    db.prepare("insert into blog_categories(id,slug,name) values(?,?,?)").run(
      "category-1",
      "guides",
      "Guides",
    );
    db.prepare("insert into blog_tags(id,slug,name) values(?,?,?)").run(
      "tag-1",
      "launch",
      "Launch",
    );
    db.prepare(
      `insert into blog_posts(id,slug,title,excerpt,content_markdown,status,featured_image_url,
        author_account_id,seo_title,seo_description,canonical_url,published_at,created_at,updated_at,category_id)
       values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      "post-1",
      "legacy-guide",
      "Legacy guide",
      "Preserved excerpt",
      "## Existing content",
      "published",
      "https://example.test/cover.png",
      "account-1",
      "SEO title",
      "SEO description",
      "https://example.test/canonical",
      1234,
      1000,
      1200,
      "category-1",
    );
    db.prepare(
      `insert into blog_posts(id,slug,title,excerpt,content_markdown,status,created_at,updated_at)
       values(?,?,?,?,?,?,?,?)`,
    ).run(
      "post-2",
      "legacy-draft",
      "Legacy draft",
      "Draft excerpt",
      "Draft body",
      "draft",
      2000,
      2100,
    );
    db.prepare("insert into blog_post_tags(post_id,tag_id) values(?,?)").run("post-1", "tag-1");
    applyBlogMigrations(db, migrationDirectory);

    expect(db.prepare("select id from blog_schema_migrations order by id").all()).toEqual([
      { id: "0001_initial_blog_schema" },
      { id: "0002_blog_revisions" },
    ]);
    expect(
      db
        .prepare(
          "select publication_state,published_revision_id,working_revision_id from blog_posts",
        )
        .get(),
    ).toEqual({
      publication_state: "published",
      published_revision_id: "post-1-r1",
      working_revision_id: null,
    });
    expect(
      db
        .prepare(
          `select slug,title,excerpt,content_markdown,desired_status,featured_image_url,
            seo_title,seo_description,canonical_url,category_id,created_by_account_id,
            created_at,updated_at from blog_post_revisions`,
        )
        .get(),
    ).toEqual({
      slug: "legacy-guide",
      title: "Legacy guide",
      excerpt: "Preserved excerpt",
      content_markdown: "## Existing content",
      desired_status: "published",
      featured_image_url: "https://example.test/cover.png",
      seo_title: "SEO title",
      seo_description: "SEO description",
      canonical_url: "https://example.test/canonical",
      category_id: "category-1",
      created_by_account_id: "account-1",
      created_at: 1000,
      updated_at: 1200,
    });
    expect(db.prepare("select * from blog_post_revision_tags").all()).toEqual([
      { revision_id: "post-1-r1", tag_id: "tag-1" },
    ]);
    expect(
      db
        .prepare(
          "select publication_state,published_revision_id,working_revision_id from blog_posts where id='post-2'",
        )
        .get(),
    ).toEqual({
      publication_state: "draft",
      published_revision_id: null,
      working_revision_id: "post-2-r1",
    });
    expect(
      db
        .prepare(
          "select title,slug,content_markdown from blog_post_revisions where post_id='post-2'",
        )
        .get(),
    ).toEqual({ title: "Legacy draft", slug: "legacy-draft", content_markdown: "Draft body" });
    expect(db.pragma("foreign_key_check")).toEqual([]);
  });

  it("is idempotent when rerun", () => {
    const db = new Database(":memory:");
    databases.push(db);
    applyBlogMigrations(db);
    applyBlogMigrations(db);
    expect(db.prepare("select id from blog_schema_migrations order by id").all()).toHaveLength(2);
  });
});
