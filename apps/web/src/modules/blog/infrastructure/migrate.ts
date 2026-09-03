import fs from "node:fs";
import path from "node:path";
import { getBlogDatabase, blogDatabasePath } from "./database";

const db = getBlogDatabase();
const migration = fs.readFileSync(
  path.join(import.meta.dirname, "migrations", "0001_initial_blog_schema.sql"),
  "utf8",
);
db.sqlite.exec(migration);
db.sqlite
  .prepare("insert or ignore into blog_schema_migrations(id, applied_at) values (?, ?)")
  .run("0001_initial_blog_schema", Date.now());
console.log(`Blog SQLite migrations applied at ${blogDatabasePath()}`);
