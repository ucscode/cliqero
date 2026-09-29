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
  it("resolves migrations from development and standalone production roots", () => {
    expect(blogMigrationDirectory("/repo/apps/web")).toBe(
      "/repo/apps/web/src/infrastructure/blog/migrations",
    );
    expect(blogMigrationDirectory("/app")).toBe("/app/apps/web/src/infrastructure/blog/migrations");
  });
  it("converts the current legacy revision database into canonical posts, categories, tags, and previews", () => {
    const db = new Database(":memory:");
    databases.push(db);
    db.pragma("foreign_keys = ON");
    db.exec(fs.readFileSync(path.join(migrationDirectory, "0001_initial_blog_schema.sql"), "utf8"));
    db.prepare("insert into blog_categories(id,slug,name) values(?,?,?)").run(
      "cat-1",
      "guides",
      "Guides",
    );
    db.prepare("insert into blog_tags(id,slug,name) values(?,?,?)").run(
      "tag-1",
      "launch",
      "Launch",
    );
    db.prepare(
      `insert into blog_posts(id,slug,title,excerpt,content_markdown,status,author_account_id,created_at,updated_at,category_id)
      values(?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      "post-1",
      "old-slug",
      "Old title",
      "Excerpt",
      "Old body",
      "published",
      "account-1",
      1000,
      1200,
      "cat-1",
    );
    db.prepare("insert into blog_post_tags(post_id,tag_id) values(?,?)").run("post-1", "tag-1");
    applyBlogMigrations(db, migrationDirectory);
    expect(db.prepare("select id from blog_schema_migrations order by id").all()).toEqual([
      { id: "0001_initial_blog_schema" },
      { id: "0002_blog_revisions" },
      { id: "0003_blog_previews" },
      { id: "0004_blog_post_categories" },
      { id: "0005_blog_canonical_posts" },
    ]);
    expect(
      db
        .prepare(
          "select slug,title,excerpt,content_markdown,status,author_account_id,created_at from blog_posts",
        )
        .get(),
    ).toEqual({
      slug: "old-slug",
      title: "Old title",
      excerpt: "Excerpt",
      content_markdown: "Old body",
      status: "published",
      author_account_id: "account-1",
      created_at: 1000,
    });
    expect(db.prepare("select post_id,category_id from blog_post_categories").all()).toEqual([
      { post_id: "post-1", category_id: "cat-1" },
    ]);
    expect(db.prepare("select post_id,tag_id from blog_post_tags").all()).toEqual([
      { post_id: "post-1", tag_id: "tag-1" },
    ]);
    expect(
      db
        .prepare("select name from sqlite_master where type='table' and name like '%revision%'")
        .all(),
    ).toEqual([]);
    expect(db.prepare("select count(*) count from blog_previews").get()).toEqual({ count: 0 });
    expect(db.pragma("foreign_key_check")).toEqual([]);
  });
  it("applies ordered migrations only once", () => {
    const db = new Database(":memory:");
    databases.push(db);
    applyBlogMigrations(db, migrationDirectory);
    applyBlogMigrations(db, migrationDirectory);
    expect(db.prepare("select id from blog_schema_migrations order by id").all()).toHaveLength(5);
  });
});
