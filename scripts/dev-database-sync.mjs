import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = resolve(root, "database/migrations/001_initial_schema.sql");

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

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function psql(database, args, input) {
  const config = composeConfiguration();
  const postgres = config.services?.postgres;
  const main = config.services?.main;
  const user = postgres?.environment?.POSTGRES_USER;
  const configuredDatabase = postgres?.environment?.POSTGRES_DB;
  const applicationUrl = main?.environment?.DATABASE_URL;
  if (!user || !configuredDatabase || !applicationUrl)
    throw new Error("Development Compose must define its PostgreSQL user, database, and app URL.");
  const appDatabase = new URL(applicationUrl).pathname.slice(1);
  const isTemporaryReference = /^cliqero_schema_reference_[a-f0-9]{12}$/.test(database);
  if (
    appDatabase !== configuredDatabase ||
    (database !== configuredDatabase && !isTemporaryReference)
  )
    throw new Error("Refusing schema sync: target must be the local Compose development database.");
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
      user,
      "-d",
      database,
      ...args,
    ],
    input === undefined ? {} : { input },
  );
}

const columnsSql = `
select coalesce(json_agg(json_build_object(
  'schema', n.nspname,
  'table', c.relname,
  'column', a.attname,
  'type', format_type(a.atttypid, a.atttypmod),
  'notNull', a.attnotnull,
  'default', pg_get_expr(d.adbin, d.adrelid),
  'identity', a.attidentity,
  'generated', a.attgenerated
) order by n.nspname, c.relname, a.attnum), '[]'::json)::text
from pg_attribute a
join pg_class c on c.oid=a.attrelid
join pg_namespace n on n.oid=c.relnamespace
left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
where a.attnum > 0 and not a.attisdropped and c.relkind in ('r','p')
  and n.nspname not in ('pg_catalog','information_schema')
`;

export function columnDrift(canonical, current) {
  const currentByTable = new Map();
  for (const column of current) {
    const key = `${column.schema}.${column.table}`;
    const columns = currentByTable.get(key) ?? new Set();
    columns.add(column.column);
    currentByTable.set(key, columns);
  }
  const additions = [];
  const unsafe = [];
  for (const column of canonical) {
    if (currentByTable.get(`${column.schema}.${column.table}`)?.has(column.column)) continue;
    const absentTable = !currentByTable.has(`${column.schema}.${column.table}`);
    if (absentTable || column.notNull || column.default || column.identity || column.generated) {
      unsafe.push(`${column.schema}.${column.table}.${column.column}`);
    } else {
      additions.push(column);
    }
  }
  return { additions, unsafe };
}

function readColumns(database) {
  return JSON.parse(psql(database, ["-At", "-c", columnsSql]));
}

function dropReferenceDatabase(name, developmentDatabase) {
  psql(developmentDatabase, [
    "-c",
    `drop database if exists ${quoteIdentifier(name)} with (force)`,
  ]);
}

function syncDevelopmentDatabase() {
  const configuration = composeConfiguration();
  const database = configuration.services?.postgres?.environment?.POSTGRES_DB;
  if (!database) throw new Error("The local Compose PostgreSQL database name is missing.");
  const reference = `cliqero_schema_reference_${randomBytes(6).toString("hex")}`;
  let referenceCreated = false;
  try {
    psql(database, ["-c", `create database ${quoteIdentifier(reference)}`]);
    referenceCreated = true;
    const baseline = readFileSync(baselinePath, "utf8");
    psql(reference, ["-f", "-"], baseline);
    const { additions, unsafe } = columnDrift(readColumns(reference), readColumns(database));
    if (unsafe.length)
      throw new Error(
        `Schema drift needs deliberate review; this safe sync will not alter or backfill: ${unsafe.join(", ")}`,
      );
    for (const column of additions) {
      psql(database, [
        "-c",
        `alter table ${quoteIdentifier(column.schema)}.${quoteIdentifier(column.table)} add column ${quoteIdentifier(column.column)} ${column.type}`,
      ]);
    }
    const remaining = columnDrift(readColumns(reference), readColumns(database));
    if (remaining.additions.length || remaining.unsafe.length)
      throw new Error(
        "Development schema reconciliation did not converge to the canonical columns.",
      );
    process.stdout.write(
      additions.length
        ? `Added ${additions.length} safe nullable column(s) from the canonical baseline: ${additions.map((column) => `${column.schema}.${column.table}.${column.column}`).join(", ")}\n`
        : "Development database columns already match the canonical baseline. No changes made.\n",
    );
  } finally {
    if (referenceCreated) dropReferenceDatabase(reference, database);
  }
}

syncDevelopmentDatabase();
