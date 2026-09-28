import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { applyBlogMigrations } from "./migration-runner";
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
  applyBlogMigrations(sqlite);
  cached = Object.assign(drizzle(sqlite, { schema }), { sqlite });
  return cached;
}

export function closeBlogDatabaseForTests() {
  cached?.sqlite.close();
  cached = undefined;
}
