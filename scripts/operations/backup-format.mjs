import { createHash } from "node:crypto";
import { createReadStream, existsSync, realpathSync } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

export const BACKUP_COMPONENTS = ["postgres.dump", "blog.sqlite", "media.tar.gz"];

export function isInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

export function assertExternalDirectory(candidate, repositoryRoot) {
  const absolute = path.resolve(candidate);
  let existing = absolute;
  while (!existsSync(existing)) existing = path.dirname(existing);
  const resolved = path.join(realpathSync(existing), path.relative(existing, absolute));
  if (resolved === path.parse(resolved).root || isInside(repositoryRoot, resolved))
    throw new Error("Backup output must be a dedicated directory outside the repository.");
  return resolved;
}

export function assertFilesystemProviderCoverage(providerNames, providers) {
  for (const providerName of providerNames) {
    const provider = providers[providerName];
    if (!provider)
      throw new Error(`Media provider ${providerName} is not configured; backup is incomplete.`);
    if (provider.provider !== "filesystem")
      throw new Error(
        `Persistent objects use external storage provider ${providerName}; configure and verify its provider-native backup before claiming a complete bundle.`,
      );
    const root = provider.config?.root;
    if (root !== "%env(MEDIA_ROOT)%" && root !== "/var/lib/cliqero/media")
      throw new Error(
        `Filesystem provider ${providerName} is outside the persistent media volume.`,
      );
  }
}

export async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export function validateManifest(manifest) {
  if (
    !manifest ||
    manifest.format !== "cliqero-backup-v1" ||
    manifest.status !== "complete" ||
    typeof manifest.createdAt !== "string" ||
    Number.isNaN(Date.parse(manifest.createdAt)) ||
    typeof manifest.applicationVersion !== "string" ||
    typeof manifest.schemaBaselineSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(manifest.schemaBaselineSha256) ||
    !manifest.components ||
    typeof manifest.components !== "object"
  ) {
    throw new Error("Backup manifest is missing required completion or identity metadata.");
  }
  for (const name of BACKUP_COMPONENTS) {
    const component = manifest.components[name];
    if (
      !component ||
      component.included !== true ||
      typeof component.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(component.sha256) ||
      !Number.isSafeInteger(component.bytes) ||
      component.bytes <= 0
    ) {
      throw new Error(`Backup manifest does not contain a valid ${name} artifact.`);
    }
  }
  if (manifest.configuration?.included !== false)
    throw new Error("Backup manifest must explicitly identify separately managed configuration.");
  return manifest;
}

export async function verifyBackupDirectory(directory) {
  const manifest = validateManifest(
    JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")),
  );
  for (const filename of BACKUP_COMPONENTS) {
    const file = path.join(directory, filename);
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error(`Backup component is not a regular file: ${filename}`);
    const expected = manifest.components[filename];
    if (info.size !== expected.bytes || (await sha256File(file)) !== expected.sha256)
      throw new Error(`Backup component checksum/size mismatch: ${filename}`);
  }
  return manifest;
}
