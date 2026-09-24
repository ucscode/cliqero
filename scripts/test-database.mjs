import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testDatabase = "cliqero_test";

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${program} exited with status ${result.status ?? "unknown"}`);
  }
  return result.stdout ?? "";
}

function composeConfiguration() {
  return JSON.parse(command("docker", ["compose", "config", "--format", "json"]));
}

function databaseName(connectionString) {
  if (!connectionString) return null;
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("A PostgreSQL connection URL is invalid");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("A PostgreSQL connection URL is required");
  }
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!name) throw new Error("The PostgreSQL connection URL must name a database");
  return name;
}

function quoteIdentifier(identifier) {
  if (!identifier || identifier.includes("\0")) {
    throw new Error("Compose PostgreSQL database and role names must be valid SQL identifiers");
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

function localDatabaseSettings(configuration) {
  const postgres = configuration.services?.postgres;
  const main = configuration.services?.main;
  const environment = postgres?.environment ?? {};
  const user = environment.POSTGRES_USER;
  const password = environment.POSTGRES_PASSWORD;
  const developmentDatabase = environment.POSTGRES_DB;
  const port = postgres?.ports?.find((item) => item.target === 5432)?.published;
  const hostIp = postgres?.ports?.find((item) => item.target === 5432)?.host_ip;
  if (!user || !password || !developmentDatabase || !port) {
    throw new Error(
      "Compose PostgreSQL must define its login, development database, and host port",
    );
  }

  const applicationDatabase = databaseName(main?.environment?.DATABASE_URL);
  const host = !hostIp || ["0.0.0.0", "::", ""].includes(hostIp) ? "localhost" : hostIp;
  const url = new URL("postgresql://localhost");
  url.username = user;
  url.password = password;
  url.hostname = host;
  url.port = String(port);
  url.pathname = `/${testDatabase}`;

  return {
    user,
    developmentDatabase,
    applicationDatabase,
    port: String(port),
    host,
    url: url.toString(),
  };
}

function ensureExplicitUrlIsNotDevelopmentDatabase(value, configuration, settings) {
  const targetDatabase = databaseName(value);
  const target = new URL(value);
  const applicationUrl = configuration.services?.main?.environment?.DATABASE_URL;
  const candidates = [process.env.DATABASE_URL, applicationUrl].filter(Boolean);
  for (const candidate of candidates) {
    if (value === candidate) {
      throw new Error("Refusing to run destructive integration tests against DATABASE_URL");
    }
    const developmentUrl = new URL(candidate);
    const sameEndpoint =
      target.hostname.toLowerCase() === developmentUrl.hostname.toLowerCase() &&
      (target.port || "5432") === (developmentUrl.port || "5432");
    if (sameEndpoint && targetDatabase === databaseName(candidate)) {
      throw new Error(
        "Refusing to run destructive integration tests against the development database",
      );
    }
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (
    localHosts.has(target.hostname.toLowerCase()) &&
    (target.port || "5432") === settings.port &&
    targetDatabase === settings.developmentDatabase
  ) {
    throw new Error(
      "Refusing to run destructive integration tests against the local development database",
    );
  }
}

function runPsql(settings, database, args, options = {}) {
  return command(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      settings.user,
      "-d",
      database,
      ...args,
    ],
    options,
  );
}

function resetLocalTestDatabase(configuration) {
  const settings = localDatabaseSettings(configuration);
  if (
    testDatabase === settings.developmentDatabase ||
    testDatabase === settings.applicationDatabase
  ) {
    throw new Error(
      `Refusing to reset ${testDatabase}: it matches the configured development database`,
    );
  }
  command("docker", ["compose", "up", "-d", "--wait", "postgres"]);
  runPsql(settings, settings.developmentDatabase, ["-c", "select 1"], { stdio: "ignore" });
  runPsql(settings, settings.developmentDatabase, [
    "-c",
    `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${testDatabase}' and pid <> pg_backend_pid()`,
  ]);
  runPsql(settings, settings.developmentDatabase, [
    "-c",
    `drop database if exists ${quoteIdentifier(testDatabase)}`,
  ]);
  runPsql(settings, settings.developmentDatabase, [
    "-c",
    `create database ${quoteIdentifier(testDatabase)} owner ${quoteIdentifier(settings.user)}`,
  ]);
  const baseline = readFileSync(resolve(root, "database/migrations/001_initial_schema.sql"));
  runPsql(settings, testDatabase, ["-f", "-"], { input: baseline });
  return settings;
}

function runIntegration(connectionString) {
  const env = {
    ...process.env,
    TEST_DATABASE_URL: connectionString,
    APP_URL: "http://localhost:3000",
    MEDIA_ROOT: "/tmp/cliqero-media",
    BLOG_DATABASE_PATH: "/tmp/cliqero-blog-integration.sqlite",
  };
  command(
    "npm",
    ["run", "test:integration", "--workspace", "@cliqero/web", "--", "--no-file-parallelism"],
    { env, stdio: "inherit" },
  );
}

const action = process.argv[2];
if (action !== "reset" && action !== "integration") {
  throw new Error("Usage: node scripts/test-database.mjs <reset|integration>");
}

const configuration = composeConfiguration();
if (action === "reset") {
  resetLocalTestDatabase(configuration);
  process.stdout.write("Prepared cliqero_test from database/migrations/001_initial_schema.sql.\n");
} else if (process.env.TEST_DATABASE_URL) {
  const settings = localDatabaseSettings(configuration);
  ensureExplicitUrlIsNotDevelopmentDatabase(process.env.TEST_DATABASE_URL, configuration, settings);
  runIntegration(process.env.TEST_DATABASE_URL);
} else {
  const settings = resetLocalTestDatabase(configuration);
  process.stdout.write("Prepared cliqero_test from database/migrations/001_initial_schema.sql.\n");
  runIntegration(settings.url);
}
