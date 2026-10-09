import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertExternalDirectory,
  assertFilesystemProviderCoverage,
  isInside,
  sha256File,
  validateManifest,
  verifyBackupDirectory,
} from "../../../../../scripts/operations/backup-format.mjs";
import { archiveMedia, snapshotStores } from "../../../../../scripts/operations/backup-stores.mjs";
import {
  composeArgumentsForEnvironment,
  postgresArchiveInspectionArguments,
  resolvePostgresImage,
} from "../../../../../scripts/operations/backup-verification.mjs";

const temporaryDirectories = [];

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cliqero-backup-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe("backup artifact safety", () => {
  it("rejects a backup destination inside the repository", () => {
    expect(() => assertExternalDirectory("var/backups", process.cwd())).toThrow(
      "outside the repository",
    );
    expect(isInside(process.cwd(), path.join(process.cwd(), "var/backups"))).toBe(true);
    expect(assertExternalDirectory(path.join(os.tmpdir(), "cliqero-backups"), process.cwd())).toBe(
      path.join(os.tmpdir(), "cliqero-backups"),
    );
  });

  it.each([
    ["development", ["compose"]],
    ["production", ["compose", "-p", "cliqero-prod", "-f", "compose.yaml"]],
  ])("selects the %s Compose configuration explicitly", (environment, expectedArguments) => {
    const run = vi.fn(() =>
      JSON.stringify({
        services: {
          postgres: {
            image: "postgres:17",
            environment: { CLIQERO_DEPLOYMENT_MODE: environment },
          },
        },
      }),
    );
    expect(resolvePostgresImage(environment, run)).toBe("postgres:17");
    expect(run).toHaveBeenCalledWith(
      "docker",
      [...expectedArguments, "config", "--format", "json"],
      { capture: true },
    );
  });

  it("inspects PostgreSQL archives without Compose services or database volumes", () => {
    expect(postgresArchiveInspectionArguments("/backups/bundle", "postgres:17")).toEqual([
      "run",
      "--rm",
      "--network",
      "none",
      "-v",
      "/backups/bundle:/verify:ro",
      "--entrypoint",
      "pg_restore",
      "postgres:17",
      "--list",
      "/verify/postgres.dump",
    ]);
  });

  it("rejects an unknown environment or mismatched Compose mode", () => {
    expect(() => composeArgumentsForEnvironment("staging")).toThrow(
      "must be development or production",
    );
    expect(() =>
      resolvePostgresImage("production", () =>
        JSON.stringify({
          services: {
            postgres: {
              image: "postgres:17",
              environment: { CLIQERO_DEPLOYMENT_MODE: "development" },
            },
          },
        }),
      ),
    ).toThrow("does not match the verification environment");
  });

  it("accepts only known filesystem-backed persisted object providers", () => {
    expect(() =>
      assertFilesystemProviderCoverage(["filesystem"], {
        filesystem: { provider: "filesystem", config: { root: "%env(MEDIA_ROOT)%" } },
      }),
    ).not.toThrow();
    expect(() =>
      assertFilesystemProviderCoverage(["cloud"], {
        cloud: { provider: "cloudflare-r2", config: {} },
      }),
    ).toThrow("provider-native backup");
    expect(() => assertFilesystemProviderCoverage(["missing"], {})).toThrow("not configured");
  });

  it("requires all components and an explicit complete manifest", () => {
    const checksum = "a".repeat(64);
    const components = Object.fromEntries(
      ["postgres.dump", "blog.sqlite", "media.tar.gz"].map((name) => [
        name,
        { included: true, bytes: 1, sha256: checksum },
      ]),
    );
    expect(
      validateManifest({
        format: "cliqero-backup-v1",
        status: "complete",
        createdAt: new Date().toISOString(),
        applicationVersion: "0.1.0",
        schemaBaselineSha256: checksum,
        components,
        configuration: { included: false },
      }),
    ).toMatchObject({ status: "complete" });
    expect(() =>
      validateManifest({
        format: "cliqero-backup-v1",
        status: "complete",
        createdAt: new Date().toISOString(),
        applicationVersion: "0.1.0",
        schemaBaselineSha256: checksum,
        components: { ...components, "blog.sqlite": undefined },
        configuration: { included: false },
      }),
    ).toThrow("blog.sqlite");
    expect(() =>
      validateManifest({
        format: "cliqero-backup-v1",
        status: "incomplete",
        components,
        configuration: { included: false },
      }),
    ).toThrow("completion");
  });

  it("uses SQLite's online backup with WAL data and preserves media bytes", async () => {
    const directory = temporaryDirectory();
    const source = path.join(directory, "source.sqlite");
    const blogSnapshot = path.join(directory, "snapshot.sqlite");
    const mediaRoot = path.join(directory, "media");
    const archive = path.join(directory, "media.tar.gz");
    fs.mkdirSync(mediaRoot);
    fs.writeFileSync(path.join(mediaRoot, "listing-image.bin"), Buffer.from([0, 1, 2, 255]));

    const database = new Database(source);
    database.pragma("journal_mode = WAL");
    database.exec("CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT NOT NULL)");
    database.prepare("INSERT INTO posts (title) VALUES (?)").run("Persisted while WAL was active");
    expect(database.pragma("journal_mode", { simple: true })).toBe("wal");
    await snapshotStores(source, blogSnapshot, mediaRoot, archive);
    database.close();

    const restored = new Database(blogSnapshot, { readonly: true });
    expect(restored.prepare("SELECT title FROM posts").get()).toEqual({
      title: "Persisted while WAL was active",
    });
    expect(restored.pragma("integrity_check", { simple: true })).toBe("ok");
    restored.close();

    const listed = spawnSync("tar", ["-tzf", archive], { encoding: "utf8" });
    expect(listed.status).toBe(0);
    expect(listed.stdout).toContain("listing-image.bin");
  });

  it("rejects a missing component and a modified artifact", async () => {
    const directory = temporaryDirectory();
    const checksum = "a".repeat(64);
    const names = ["postgres.dump", "blog.sqlite", "media.tar.gz"];
    for (const name of names) fs.writeFileSync(path.join(directory, name), "x");
    const components = Object.fromEntries(
      await Promise.all(
        names.map(async (name) => [
          name,
          {
            included: true,
            bytes: 1,
            sha256: await sha256File(path.join(directory, name)),
          },
        ]),
      ),
    );
    fs.writeFileSync(
      path.join(directory, "manifest.json"),
      JSON.stringify({
        format: "cliqero-backup-v1",
        status: "complete",
        createdAt: new Date().toISOString(),
        applicationVersion: "0.1.0",
        schemaBaselineSha256: checksum,
        components,
        configuration: { included: false },
      }),
    );
    expect(await verifyBackupDirectory(directory)).toMatchObject({ status: "complete" });
    fs.writeFileSync(path.join(directory, "blog.sqlite"), "corrupted");
    await expect(verifyBackupDirectory(directory)).rejects.toThrow("blog.sqlite");
    fs.unlinkSync(path.join(directory, "blog.sqlite"));
    await expect(verifyBackupDirectory(directory)).rejects.toThrow();
  });

  it("fails closed on media trees containing symbolic links", () => {
    const directory = temporaryDirectory();
    const mediaRoot = path.join(directory, "media");
    fs.mkdirSync(mediaRoot);
    fs.symlinkSync(os.tmpdir(), path.join(mediaRoot, "outside"));
    expect(() => archiveMedia(mediaRoot, path.join(directory, "media.tar.gz"))).toThrow(
      "symbolic links",
    );
  });
});
