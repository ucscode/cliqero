import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

const initialSchema = "0001_initial_blog_schema.sql";

export function blogMigrationDirectory(cwd = process.cwd()) {
  const webRoot =
    path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps"
      ? cwd
      : path.join(cwd, "apps", "web");
  return path.join(webRoot, "src", "infrastructure", "blog", "migrations");
}

/** Apply the single authoritative pre-production Blog schema to a fresh SQLite database. */
export function applyBlogMigrations(
  sqlite: Database.Database,
  directory = blogMigrationDirectory(),
) {
  sqlite.exec(fs.readFileSync(path.join(directory, initialSchema), "utf8"));
}
