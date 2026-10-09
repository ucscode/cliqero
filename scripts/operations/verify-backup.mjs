#!/usr/bin/env node
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { verifyBackupDirectory } from "./backup-format.mjs";

const directory = path.resolve(process.argv[2] ?? "");
if (!process.argv[2])
  throw new Error("Usage: node scripts/operations/verify-backup.mjs <backup-directory>");
const manifest = await verifyBackupDirectory(directory);
const require = createRequire(path.join(process.cwd(), "package.json"));
const Database = require("better-sqlite3");
const blog = new Database(path.join(directory, "blog.sqlite"), {
  readonly: true,
  fileMustExist: true,
});
try {
  if (blog.pragma("integrity_check", { simple: true }) !== "ok")
    throw new Error("Blog SQLite integrity check failed.");
} finally {
  blog.close();
}
const archive = spawnSync("tar", ["-tzf", path.join(directory, "media.tar.gz")], {
  stdio: "ignore",
});
if (archive.error) throw archive.error;
if (archive.status !== 0) throw new Error("Media archive integrity check failed.");
const postgres = spawnSync(
  "docker",
  [
    "compose",
    "run",
    "--rm",
    "--no-deps",
    "-T",
    "-v",
    `${directory}:/verify:ro`,
    "--entrypoint",
    "pg_restore",
    "postgres",
    "--list",
    "/verify/postgres.dump",
  ],
  { stdio: "ignore" },
);
if (postgres.error) throw postgres.error;
if (postgres.status !== 0) throw new Error("PostgreSQL dump archive integrity check failed.");
console.log(`Backup verified: ${manifest.createdAt} (${manifest.sourceCommit})`);
