import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

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
  const schema = fs.readFileSync(path.join(directory, initialSchema), "utf8");
  const current = schemaObjects(sqlite);
  if (current.length) {
    const expectedDatabase = new Database(":memory:");
    try {
      expectedDatabase.exec(schema);
      if (!sameSchemaObjects(current, schemaObjects(expectedDatabase)))
        throw new Error(
          "Blog SQLite database does not match the current baseline; explicitly reset the development Blog database.",
        );
      return;
    } finally {
      expectedDatabase.close();
    }
  }
  sqlite.exec(schema);
}

function schemaObjects(sqlite: Database.Database) {
  return sqlite
    .prepare(
      `select type, name, sql from sqlite_master
       where type in ('table', 'index', 'view', 'trigger')
         and name like 'blog_%' and sql is not null
       order by type, name`,
    )
    .all() as { type: string; name: string; sql: string }[];
}

function sameSchemaObjects(
  current: { type: string; name: string; sql: string }[],
  expected: { type: string; name: string; sql: string }[],
) {
  const normalize = (objects: typeof current) =>
    objects.map(({ type, name, sql }) => ({
      type,
      name,
      sql: sql
        .replace(/\bif\s+not\s+exists\b/gi, "")
        .replace(/\s+/g, " ")
        .trim(),
    }));
  return JSON.stringify(normalize(current)) === JSON.stringify(normalize(expected));
}
