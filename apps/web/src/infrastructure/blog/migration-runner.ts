import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

const migrationName = /^\d{4}_[a-z0-9_]+\.sql$/;

export function blogMigrationDirectory(cwd = process.cwd()) {
  const webRoot =
    path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps"
      ? cwd
      : path.join(cwd, "apps", "web");
  return path.join(webRoot, "src", "infrastructure", "blog", "migrations");
}

export function applyBlogMigrations(
  sqlite: Database.Database,
  directory = blogMigrationDirectory(),
) {
  sqlite.exec(
    "create table if not exists blog_schema_migrations (id text primary key not null, applied_at integer not null)",
  );
  const legacySchemaExists = Boolean(
    sqlite.prepare("select 1 from sqlite_master where type='table' and name='blog_posts'").get(),
  );
  const migrationOneApplied = sqlite
    .prepare("select 1 from blog_schema_migrations where id=?")
    .get("0001_initial_blog_schema");
  if (legacySchemaExists && !migrationOneApplied) {
    sqlite
      .prepare("insert into blog_schema_migrations(id, applied_at) values (?, ?)")
      .run("0001_initial_blog_schema", Date.now());
  }

  const migrations = fs
    .readdirSync(directory)
    .filter((name) => migrationName.test(name))
    .sort();
  for (const name of migrations) {
    const id = name.slice(0, -".sql".length);
    if (sqlite.prepare("select 1 from blog_schema_migrations where id=?").get(id)) continue;
    const sql = fs.readFileSync(path.join(directory, name), "utf8");
    const changesForeignKeys = id === "0002_blog_revisions";
    if (changesForeignKeys) sqlite.pragma("foreign_keys = OFF");
    try {
      sqlite.transaction(() => {
        sqlite.exec(sql);
        sqlite
          .prepare("insert into blog_schema_migrations(id, applied_at) values (?, ?)")
          .run(id, Date.now());
      })();
      if (changesForeignKeys) {
        const violations = sqlite.pragma("foreign_key_check") as unknown[];
        if (violations.length) throw new Error(`Blog migration ${id} left foreign-key violations`);
      }
    } finally {
      if (changesForeignKeys) sqlite.pragma("foreign_keys = ON");
    }
  }
}
