#!/usr/bin/env node
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { verifyBackupDirectory } from "./backup-format.mjs";
import {
  postgresArchiveInspectionArguments,
  resolvePostgresImage,
} from "./backup-verification.mjs";

const directory = path.resolve(process.argv[2] ?? "");
const environmentArgument = process.argv.indexOf("--environment");
const environment =
  environmentArgument === -1 ? "development" : process.argv[environmentArgument + 1];
if (!process.argv[2] || process.argv[2].startsWith("--"))
  throw new Error(
    "Usage: node scripts/operations/verify-backup.mjs <backup-directory> [--environment development|production]",
  );
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
const run = (command, args, { capture = false } = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: capture ? "pipe" : "ignore",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} command failed`);
  return capture ? result.stdout : "";
};
const postgresImage = resolvePostgresImage(environment, run);
const postgres = spawnSync("docker", postgresArchiveInspectionArguments(directory, postgresImage), {
  stdio: "ignore",
});
if (postgres.error) throw postgres.error;
if (postgres.status !== 0) throw new Error("PostgreSQL dump archive integrity check failed.");
console.log(`Backup verified: ${manifest.createdAt} (${manifest.sourceCommit})`);
