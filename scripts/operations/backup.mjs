#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { parse as parseYaml } from "yaml";
import {
  assertExternalDirectory,
  assertFilesystemProviderCoverage,
  BACKUP_COMPONENTS,
  sha256File,
  validateManifest,
} from "./backup-format.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arguments_ = process.argv.slice(2);
const valueFor = (name, fallback) => {
  const index = arguments_.indexOf(name);
  return index === -1 ? fallback : arguments_[index + 1];
};
const production = arguments_.includes("--production");
const productionConfirmation = valueFor("--confirm-production", "");
const noOtherWriters = valueFor("--confirm-quiescence", "");
const outputRoot = assertExternalDirectory(
  valueFor("--output", path.resolve(repositoryRoot, "../cliqero-backups")),
  repositoryRoot,
);
if (noOtherWriters !== "NO OTHER WRITERS")
  throw new Error('Confirm the maintenance window with --confirm-quiescence "NO OTHER WRITERS".');
if (production && productionConfirmation !== "BACK UP PRODUCTION")
  throw new Error('Production backup requires --confirm-production "BACK UP PRODUCTION".');

const compose = production ? ["compose", "-p", "cliqero-prod", "-f", "compose.yaml"] : ["compose"];
const composeJson = run("docker", [...compose, "config", "--format", "json"], { capture: true });
const configuration = JSON.parse(composeJson);
const mode = configuration.services?.main?.environment?.CLIQERO_DEPLOYMENT_MODE;
if (mode !== (production ? "production" : "development"))
  throw new Error("Selected Compose configuration does not match the requested backup mode.");
const dockerRoot = run("docker", ["info", "--format", "{{.DockerRootDir}}"], {
  capture: true,
}).trim();
assertExternalDirectory(outputRoot, dockerRoot);

const mediaConfigurationPath = path.join(repositoryRoot, "config/storage/media.yaml");
let mediaConfiguration;
try {
  mediaConfiguration = parseYaml(await fs.readFile(mediaConfigurationPath, "utf8"))?.parameters;
} catch {
  throw new Error(
    "Media provider configuration could not be parsed; refusing an incomplete backup.",
  );
}
const configuredProviders = mediaConfiguration?.providers;
if (!configuredProviders || typeof configuredProviders !== "object")
  throw new Error("Media provider configuration is unavailable; refusing an incomplete backup.");

const postgresId = run("docker", [...compose, "ps", "-q", "postgres"], { capture: true }).trim();
const mainId = run("docker", [...compose, "ps", "-q", "main"], { capture: true }).trim();
if (!postgresId || !mainId) throw new Error("PostgreSQL and main containers must already exist.");
const postgresInspect = JSON.parse(run("docker", ["inspect", postgresId], { capture: true }))[0];
const mainInspect = JSON.parse(run("docker", ["inspect", mainId], { capture: true }))[0];
if (!postgresInspect.State.Running || !mainInspect.State.Running)
  throw new Error("PostgreSQL and main services must be running before backup.");
if (postgresInspect.State.Health?.Status !== "healthy")
  throw new Error("PostgreSQL must report healthy before backup.");
const postgresMount = postgresInspect.Mounts.find(
  (mount) => mount.Destination === "/var/lib/postgresql/data",
);
const blogMount = mainInspect.Mounts.find((mount) => mount.Destination === "/workspace/data/blog");
const mediaMount = mainInspect.Mounts.find(
  (mount) => mount.Destination === "/var/lib/cliqero/media",
);
if (
  postgresMount?.Type !== "volume" ||
  blogMount?.Type !== "volume" ||
  mediaMount?.Type !== "volume"
)
  throw new Error("Expected persistent named volumes for PostgreSQL, Blog, and filesystem media.");

const outputExisted = await fs
  .stat(outputRoot)
  .then(() => true)
  .catch(() => false);
await fs.mkdir(outputRoot, { recursive: true, mode: 0o700 });
if (!outputExisted) await fs.chmod(outputRoot, 0o700);
else if ((await fs.stat(outputRoot)).mode & 0o077)
  throw new Error(
    "Existing backup output directory must not be accessible by group or other users.",
  );
const timestamp = new Date().toISOString().replaceAll(":", "").replaceAll("-", "");
const finalDirectory = path.join(outputRoot, `cliqero-${timestamp}`);
const stagingDirectory = await fs.mkdtemp(path.join(outputRoot, ".cliqero-incomplete-"));
await fs.chmod(stagingDirectory, 0o700);
const startedServices = ["main", "outbox-worker"].filter((service) =>
  Boolean(
    run("docker", [...compose, "ps", "--status", "running", "-q", service], {
      capture: true,
    }).trim(),
  ),
);
const sourceWorktreeClean = run("git", ["status", "--porcelain"], { capture: true }).trim() === "";

try {
  if (startedServices.length) run("docker", [...compose, "stop", ...startedServices]);

  // Resolve persisted object providers only after writer quiescence so a new
  // external-provider object cannot appear between this check and file capture.
  const usedProviders = run(
    "docker",
    [
      ...compose,
      "exec",
      "-T",
      "postgres",
      "sh",
      "-ec",
      'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT storage_provider FROM listing_capability.media UNION SELECT proof_storage_provider FROM funding_capability.funding_evidence WHERE proof_storage_provider IS NOT NULL"',
    ],
    { capture: true },
  )
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  assertFilesystemProviderCoverage(usedProviders, configuredProviders);

  await dumpPostgres(path.join(stagingDirectory, "postgres.dump"), compose);
  const helperPath = path.join(repositoryRoot, "scripts/operations/backup-stores.mjs");
  run("docker", [
    ...compose,
    "run",
    "--rm",
    "--no-deps",
    "-T",
    "--user",
    `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`,
    "-v",
    `${stagingDirectory}:/backup-artifacts`,
    "-v",
    `${helperPath}:/backup-helper.mjs:ro`,
    "--entrypoint",
    "node",
    "main",
    "/backup-helper.mjs",
    "/backup-artifacts/blog.sqlite",
    "/var/lib/cliqero/media",
    "/backup-artifacts/media.tar.gz",
  ]);

  run(
    "docker",
    [
      ...compose,
      "run",
      "--rm",
      "--no-deps",
      "-T",
      "-v",
      `${stagingDirectory}:/backup-artifacts:ro`,
      "--entrypoint",
      "pg_restore",
      "postgres",
      "--list",
      "/backup-artifacts/postgres.dump",
    ],
    { capture: true },
  );
  run("tar", ["-tzf", path.join(stagingDirectory, "media.tar.gz")], { capture: true });

  const components = {};
  for (const filename of BACKUP_COMPONENTS) {
    const file = path.join(stagingDirectory, filename);
    const info = await fs.stat(file);
    if (!info.isFile() || info.size === 0)
      throw new Error(`Backup component is empty: ${filename}`);
    components[filename] = { included: true, bytes: info.size, sha256: await sha256File(file) };
    await fs.chmod(file, 0o600);
  }
  const manifest = validateManifest({
    format: "cliqero-backup-v1",
    status: "complete",
    createdAt: new Date().toISOString(),
    applicationVersion: JSON.parse(
      await fs.readFile(path.join(repositoryRoot, "apps/web/package.json"), "utf8"),
    ).version,
    sourceCommit: run("git", ["rev-parse", "HEAD"], { capture: true }).trim(),
    sourceWorktreeClean,
    schemaBaselineSha256: await sha256File(
      path.join(repositoryRoot, "database/migrations/001_initial_schema.sql"),
    ),
    consistency: {
      mode: "application-writers-quiesced",
      composeProject: postgresInspect.Config.Labels?.["com.docker.compose.project"] ?? "unknown",
      postgresVolume: postgresMount.Name,
      blogVolume: blogMount.Name,
      mediaVolume: mediaMount.Name,
    },
    components,
    configuration: {
      included: false,
      recovery:
        "Restore configuration from the secured deployment configuration store; never from this data bundle.",
      requiredSecretNames: [
        "BETTER_AUTH_SECRET",
        "APP_ENCRYPTION_KEY",
        "POSTGRES_PASSWORD",
        "POSTGRES_APP_PASSWORD",
        "provider credentials",
      ],
    },
  });
  await fs.writeFile(
    path.join(stagingDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    {
      mode: 0o600,
      flag: "wx",
    },
  );
  await fs.rename(stagingDirectory, finalDirectory);
  console.log(`Verified backup created: ${finalDirectory}`);
} catch (error) {
  await fs.rm(stagingDirectory, { recursive: true, force: true });
  throw error;
} finally {
  if (startedServices.length) run("docker", [...compose, "start", ...startedServices]);
}

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} command failed${capture ? `: ${result.stderr.trim()}` : ""}`);
  return capture ? result.stdout : "";
}

async function dumpPostgres(destination, composeArgs) {
  const child = spawn(
    "docker",
    [
      ...composeArgs,
      "exec",
      "-T",
      "postgres",
      "sh",
      "-ec",
      'exec pg_dump --format=custom --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"',
    ],
    { cwd: repositoryRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  const errors = [];
  child.stderr.on("data", (chunk) => errors.push(chunk));
  try {
    await pipeline(child.stdout, createWriteStream(destination, { flags: "wx", mode: 0o600 }));
    const status = await closed;
    if (status !== 0)
      throw new Error(`pg_dump failed: ${Buffer.concat(errors).toString("utf8").trim()}`);
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
}
