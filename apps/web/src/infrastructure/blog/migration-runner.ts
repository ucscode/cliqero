import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const migrationFile = /^\d{4}_[a-z0-9_]+\.sql$/;

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
  const files = fs
    .readdirSync(directory)
    .filter((file) => migrationFile.test(file))
    .sort();
  if (!files.length) throw new Error("Blog SQLite schema migrations are missing");
  sqlite
    .transaction(() => {
      // Acquire the SQLite write lock before inspecting the checkpoint. The web
      // process and outbox worker may open the same fresh database together.
      const current = schemaObjects(sqlite);
      if (!current.length) {
        for (const file of files) sqlite.exec(fs.readFileSync(path.join(directory, file), "utf8"));
        return;
      }

      const expectedDatabase = new Database(":memory:");
      try {
        let matchedPrefix = 0;
        for (let index = 0; index < files.length; index++) {
          expectedDatabase.exec(fs.readFileSync(path.join(directory, files[index]!), "utf8"));
          if (sameSchemaObjects(current, schemaObjects(expectedDatabase)))
            matchedPrefix = index + 1;
        }
        if (!matchedPrefix)
          throw new Error("Blog SQLite database does not match any known migration checkpoint.");
        for (const file of files.slice(matchedPrefix))
          sqlite.exec(fs.readFileSync(path.join(directory, file), "utf8"));
      } finally {
        expectedDatabase.close();
      }
    })
    .immediate();
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
