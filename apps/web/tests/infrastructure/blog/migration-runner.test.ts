import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyBlogMigrations,
  blogMigrationDirectory,
} from "@/infrastructure/blog/migration-runner";
import { SqliteBlogRepository } from "@/infrastructure/blog/repository";
import { closeBlogDatabaseForTests, getBlogDatabase } from "@/infrastructure/blog/database";

const databases: Database.Database[] = [];
const migrationDirectory = path.resolve("src/infrastructure/blog/migrations");
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

describe("authoritative Blog SQLite schema", () => {
  it("resolves the schema from development and standalone production roots", () => {
    expect(blogMigrationDirectory("/repo/apps/web")).toBe(
      "/repo/apps/web/src/infrastructure/blog/migrations",
    );
    expect(blogMigrationDirectory("/app")).toBe("/app/apps/web/src/infrastructure/blog/migrations");
  });

  it("creates the complete current schema on a fresh database and accepts the current schema again", () => {
    const db = new Database(":memory:");
    databases.push(db);
    db.pragma("foreign_keys = ON");
    applyBlogMigrations(db, migrationDirectory);
    applyBlogMigrations(db, migrationDirectory);

    const tables = (
      db
        .prepare(
          "select name from sqlite_master where type='table' and name like 'blog_%' order by name",
        )
        .all() as { name: string }[]
    ).map(({ name }) => name);
    expect(tables).toEqual([
      "blog_categories",
      "blog_idempotency",
      "blog_post_categories",
      "blog_post_tags",
      "blog_posts",
      "blog_previews",
      "blog_tags",
    ]);

    const postColumns = db.pragma("table_info(blog_posts)") as { name: string }[];
    expect(postColumns.map(({ name }) => name)).toEqual([
      "id",
      "slug",
      "title",
      "excerpt",
      "content_markdown",
      "status",
      "featured_image_url",
      "author_account_id",
      "seo_title",
      "seo_description",
      "canonical_url",
      "published_at",
      "created_at",
      "updated_at",
    ]);
    expect(
      db
        .prepare("select name from sqlite_master where type='table' and name like '%revision%'")
        .all(),
    ).toEqual([]);
    expect(
      db
        .prepare("select name from sqlite_master where type='index' and name=?")
        .get("blog_previews_expiry_idx"),
    ).toBeTruthy();
    expect(
      (db.pragma("table_info(blog_previews)") as { name: string }[]).map((column) => column.name),
    ).toContain("expires_at");
    expect(
      fs.readdirSync(migrationDirectory).filter((name) => /^\d{4}_.+\.sql$/.test(name)),
    ).toEqual(["0001_initial_blog_schema.sql"]);
  });

  it("fails clearly when an incompatible stale Blog table already exists", () => {
    const db = new Database(":memory:");
    databases.push(db);
    db.exec("create table blog_posts (legacy_id text primary key)");

    expect(() => applyBlogMigrations(db, migrationDirectory)).toThrow(
      /does not match the current baseline.*explicitly reset/i,
    );
    expect(db.pragma("table_info(blog_posts)")).toMatchObject([{ name: "legacy_id" }]);
  });

  it("recognizes the previous baseline when only its IF NOT EXISTS spelling differs", () => {
    const db = new Database(":memory:");
    databases.push(db);
    const schema = fs
      .readFileSync(path.join(migrationDirectory, "0001_initial_blog_schema.sql"), "utf8")
      .replace(/create (table|index|unique index) /gi, "create $1 if not exists ");
    db.exec(schema);

    expect(() => applyBlogMigrations(db, migrationDirectory)).not.toThrow();
    expect(db.pragma("table_info(blog_posts)")).toHaveLength(14);
  });

  it("initializes the application Blog database from the authoritative baseline", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cliqero-blog-baseline-"));
    const previousPath = process.env.BLOG_DATABASE_PATH;
    process.env.BLOG_DATABASE_PATH = path.join(directory, "blog.sqlite");
    try {
      const database = getBlogDatabase();
      expect(database.sqlite.prepare("select count(*) as count from blog_posts").get()).toEqual({
        count: 0,
      });
      expect(
        database.sqlite
          .prepare("select name from sqlite_master where type='table' and name like 'blog_%'")
          .all(),
      ).toHaveLength(7);
    } finally {
      closeBlogDatabaseForTests();
      if (previousPath === undefined) delete process.env.BLOG_DATABASE_PATH;
      else process.env.BLOG_DATABASE_PATH = previousPath;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("enforces taxonomy uniqueness, relationship foreign keys, and delete behavior", () => {
    const db = new Database(":memory:");
    databases.push(db);
    db.pragma("foreign_keys = ON");
    applyBlogMigrations(db, migrationDirectory);
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
      "insert into blog_posts(id,slug,title,excerpt,content_markdown,status,created_at,updated_at) values(?,?,?,?,?,?,?,?)",
    ).run("post-1", "guide", "Guide", "Excerpt", "Body", "published", 1000, 1000);
    db.prepare("insert into blog_post_categories(post_id,category_id) values(?,?)").run(
      "post-1",
      "cat-1",
    );
    db.prepare("insert into blog_post_tags(post_id,tag_id) values(?,?)").run("post-1", "tag-1");

    expect(() =>
      db
        .prepare("insert into blog_categories(id,slug,name) values(?,?,?)")
        .run("cat-2", "other", "gUiDeS"),
    ).toThrow();
    expect(() => db.prepare("delete from blog_categories where id=?").run("cat-1")).toThrow(
      /FOREIGN KEY constraint failed/,
    );
    expect(() =>
      db
        .prepare("insert into blog_post_categories(post_id,category_id) values(?,?)")
        .run("missing", "cat-1"),
    ).toThrow(/FOREIGN KEY constraint failed/);
    db.prepare("delete from blog_posts where id=?").run("post-1");
    expect(db.prepare("select * from blog_post_categories").all()).toEqual([]);
    expect(db.prepare("select * from blog_post_tags").all()).toEqual([]);
    expect(db.pragma("foreign_key_check")).toEqual([]);
  });

  it("allows the Blog repository to create and query canonical content on a fresh schema", () => {
    const db = new Database(":memory:");
    databases.push(db);
    db.pragma("foreign_keys = ON");
    applyBlogMigrations(db, migrationDirectory);
    const repository = new SqliteBlogRepository(db);
    const category = repository.categoryRepository.create({ name: "Guides", slug: "guides" });
    const post = repository.create(
      "post-1",
      {
        slug: "fresh-post",
        title: "Fresh post",
        excerpt: "Excerpt",
        content: "## Body",
        status: "published",
        featuredImageUrl: null,
        seoTitle: null,
        seoDescription: null,
        canonicalUrl: null,
        categoryIds: [category.id],
        tags: ["launch"],
      },
      "author-1",
    );
    expect(repository.get(post.id, true)).toMatchObject({
      slug: "fresh-post",
      status: "published",
      categories: [category],
      tags: [{ slug: "launch", name: "launch" }],
    });
    expect(repository.list({ publishedOnly: true }).items.map((item) => item.id)).toEqual([
      "post-1",
    ]);
  });
});
