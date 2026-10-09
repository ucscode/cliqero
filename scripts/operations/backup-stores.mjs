import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function betterSqlite() {
  return createRequire(path.join(process.cwd(), "apps", "web", "server.js"))("better-sqlite3");
}

export async function snapshotSqlite(source, destination) {
  const Database = betterSqlite();
  const database = new Database(source, { readonly: true, fileMustExist: true });
  try {
    const result = database.pragma("integrity_check", { simple: true });
    if (result !== "ok") throw new Error(`Blog SQLite integrity check failed: ${result}`);
    await database.backup(destination);
  } finally {
    database.close();
  }
  const copy = new Database(destination, { readonly: true, fileMustExist: true });
  try {
    const result = copy.pragma("integrity_check", { simple: true });
    if (result !== "ok") throw new Error(`Blog snapshot integrity check failed: ${result}`);
  } finally {
    copy.close();
  }
}

export function archiveMedia(root, destination) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
    throw new Error(`Filesystem media root is not available: ${root}`);
  assertPortableMediaTree(root);
  const result = spawnSync(
    "tar",
    ["--numeric-owner", "--acls", "--xattrs", "-czf", destination, "-C", root, "."],
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Media archive failed: ${result.stderr.trim()}`);
}

function assertPortableMediaTree(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Media backup refuses symbolic links.");
    if (entry.isDirectory()) assertPortableMediaTree(child);
    else if (!entry.isFile()) throw new Error("Media backup encountered a non-regular file.");
  }
}

export async function snapshotStores(source, blogDestination, mediaRoot, mediaDestination) {
  if (!source || !blogDestination || !mediaRoot || !mediaDestination) {
    throw new Error("Usage: backup-stores.mjs <blog.sqlite> <media-root> <media.tar.gz>");
  }
  fs.mkdirSync(path.dirname(blogDestination), { recursive: true });
  await snapshotSqlite(source, blogDestination);
  archiveMedia(mediaRoot, mediaDestination);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [blogDestination, mediaRoot, mediaDestination] = process.argv.slice(2);
  await snapshotStores(
    process.env.BLOG_DATABASE_PATH || "/workspace/data/blog/blog.sqlite",
    blogDestination,
    mediaRoot,
    mediaDestination,
  );
}
