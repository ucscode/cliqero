import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type BlogDatabase = ReturnType<typeof drizzle<typeof schema>> & {
  sqlite: Database.Database;
};

let cached: BlogDatabase | undefined;

export function blogDatabasePath() {
  return process.env.BLOG_DATABASE_PATH || path.join(process.cwd(), "data", "blog", "blog.sqlite");
}

export function getBlogDatabase(): BlogDatabase {
  if (cached) return cached;
  const file = blogDatabasePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS blog_schema_migrations (id TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS blog_posts (
      id TEXT PRIMARY KEY NOT NULL, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      excerpt TEXT NOT NULL, content_markdown TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
      featured_image_url TEXT, author_account_id TEXT, seo_title TEXT, seo_description TEXT,
      canonical_url TEXT, published_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      category_id TEXT
    );
    CREATE INDEX IF NOT EXISTS blog_posts_status_created_idx ON blog_posts(status, created_at DESC, id DESC);
    CREATE TABLE IF NOT EXISTS blog_categories (id TEXT PRIMARY KEY NOT NULL, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS blog_tags (id TEXT PRIMARY KEY NOT NULL, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS blog_post_tags (post_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY(post_id, tag_id),
      FOREIGN KEY(post_id) REFERENCES blog_posts(id) ON DELETE CASCADE, FOREIGN KEY(tag_id) REFERENCES blog_tags(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS blog_idempotency (key TEXT PRIMARY KEY NOT NULL, request_hash TEXT NOT NULL, post_id TEXT NOT NULL, created_at INTEGER NOT NULL);
  `);
  sqlite
    .prepare("insert or ignore into blog_schema_migrations(id,applied_at) values(?,?)")
    .run("0001_initial_blog_schema", Date.now());
  cached = Object.assign(drizzle(sqlite, { schema }), { sqlite });
  return cached;
}

export function closeBlogDatabaseForTests() {
  cached?.sqlite.close();
  cached = undefined;
}
