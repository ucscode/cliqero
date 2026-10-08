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

const schemaSnapshotSql = `
select json_build_object(
  'tables', coalesce((select json_agg(json_build_object('schema',n.nspname,'table',c.relname) order by n.nspname,c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname not in ('pg_catalog','information_schema')), '[]'::json),
  'columns', coalesce((select json_agg(json_build_object(
    'schema', n.nspname,'table',c.relname,'column',a.attname,
    'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,
    'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated
  ) order by n.nspname,c.relname,a.attnum)
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
    where a.attnum>0 and not a.attisdropped and c.relkind in ('r','p') and n.nspname not in ('pg_catalog','information_schema')), '[]'::json),
  'constraints', coalesce((select json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',con.conname,'definition',pg_get_constraintdef(con.oid,true)) order by n.nspname,c.relname,con.conname)
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace), '[]'::json),
  'indexes', coalesce((select json_agg(json_build_object('schema',schemaname,'table',tablename,'name',indexname,'definition',indexdef) order by schemaname,tablename,indexname)
    from pg_indexes where schemaname not in ('pg_catalog','information_schema')), '[]'::json),
  'triggers', coalesce((select json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid,true)) order by n.nspname,c.relname,t.tgname)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal), '[]'::json),
  'functions', coalesce((select json_agg(json_build_object(
    'schema',n.nspname,'name',p.proname,'identityArguments',pg_get_function_identity_arguments(p.oid),
    'definition',pg_get_functiondef(p.oid)) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind in ('f','p')
      and n.nspname not in ('pg_catalog','information_schema')), '[]'::json)
)::text
`;

/** Split baseline SQL without splitting semicolons inside quoted or dollar-quoted bodies. */
export function splitSqlStatements(sql) {
  const statements = [];
  let start = 0;
  let single = false;
  let double = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag = null;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        i += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (single) {
      if (char === "'" && next === "'") i += 1;
      else if (char === "'") single = false;
      continue;
    }
    if (double) {
      if (char === '"' && next === '"') i += 1;
      else if (char === '"') double = false;
      continue;
    }
    if (char === "-" && next === "-") {
      lineComment = true;
      i += 1;
    } else if (char === "/" && next === "*") {
      blockComment = true;
      i += 1;
    } else if (char === "'") single = true;
    else if (char === '"') double = true;
    else if (char === "$" && /^\$[A-Za-z_0-9]*\$/.test(sql.slice(i))) {
      dollarTag = sql.slice(i).match(/^\$[A-Za-z_0-9]*\$/)[0];
      i += dollarTag.length - 1;
    } else if (char === ";") {
      const statement = sql.slice(start, i + 1).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }
  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

function stripLeadingComments(value) {
  return value.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, "").trim();
}

function splitTopLevel(value) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let single = false;
  let double = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (single) {
      if (char === "'" && value[i + 1] === "'") i += 1;
      else if (char === "'") single = false;
    } else if (double) {
      if (char === '"' && value[i + 1] === '"') i += 1;
      else if (char === '"') double = false;
    } else if (char === "'") single = true;
    else if (char === '"') double = true;
    else if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function targetName(value) {
  return value.replaceAll('"', "").split(".");
}

function tableKey(value) {
  const [schema, table] = targetName(value);
  return `${schema}.${table}`;
}

function functionKey(schema, name, identityArguments) {
  return `${schema}.${name}(${functionIdentityArguments(identityArguments)})`;
}

function functionIdentityArguments(declaration) {
  return splitTopLevel(declaration)
    .map((argument) => {
      const withoutDefault = argument.replace(/\s+(?:DEFAULT|=)[\s\S]*$/i, "").trim();
      const tokens = withoutDefault.split(/\s+/);
      if (/^(?:IN|OUT|INOUT|VARIADIC)$/i.test(tokens[0])) tokens.shift();
      if (tokens.length > 1) tokens.shift();
      return tokens.join(" ").replaceAll('"', "").toLowerCase();
    })
    .join(", ");
}

function additionsFromStatements(baselineSql) {
  const tables = new Map();
  const columns = new Map();
  const constraints = new Map();
  const indexes = new Map();
  const triggers = new Map();
  const functions = new Map();
  const inlineConstraints = new Set();
  const unsupported = [];
  const unsupportedTables = new Set();
  for (const original of splitSqlStatements(baselineSql)) {
    const statement = stripLeadingComments(original);
    let match = statement.match(
      /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w"]+\.[\w"]+)\s*\(/i,
    );
    if (match) {
      const key = tableKey(match[1]);
      const body = statement.slice(statement.indexOf("(") + 1, statement.lastIndexOf(")"));
      const createDefinitions = [];
      for (const definition of splitTopLevel(body)) {
        const constraint = definition.match(/^CONSTRAINT\s+([\w"]+)\s+([\s\S]+)$/i);
        if (constraint) {
          const constraintKey = `${key}.${constraint[1].replaceAll('"', "")}`;
          const constraintBody = constraint[2].trimStart();
          constraints.set(
            constraintKey,
            `ALTER TABLE ${match[1]} ADD CONSTRAINT ${constraint[1]} ${constraintBody};`,
          );
          if (/^FOREIGN\s+KEY\b/i.test(constraintBody)) continue;
          inlineConstraints.add(constraintKey);
          createDefinitions.push(definition);
          continue;
        }
        if (/^FOREIGN\s+KEY\b/i.test(definition)) {
          const foreignKeyName = definition.match(/\bCONSTRAINT\s+([\w"]+)/i);
          if (!foreignKeyName) {
            // Canonical baseline foreign keys are named. Refuse to silently
            // omit any future unnamed key from a safe table creation.
            unsupported.push(`${key}: unnamed inline foreign key is unsupported by additive sync`);
            unsupportedTables.add(key);
            continue;
          }
          const name = foreignKeyName[1];
          const constraintKey = `${key}.${name.replaceAll('"', "")}`;
          constraints.set(constraintKey, `ALTER TABLE ${match[1]} ADD ${definition};`);
          continue;
        }
        const column = definition.match(/^([\w"]+)\s+([\s\S]+)$/);
        if (column && !/^(?:PRIMARY|UNIQUE|CHECK|FOREIGN|EXCLUDE)$/i.test(column[1])) {
          columns.set(`${key}.${column[1].replaceAll('"', "")}`, {
            table: match[1],
            name: column[1],
            definition: column[2],
          });
          createDefinitions.push(definition);
        } else createDefinitions.push(definition);
      }
      if (!unsupportedTables.has(key))
        tables.set(
          key,
          `${statement.slice(0, statement.indexOf("(") + 1)}\n${createDefinitions.join(",\n")}\n);`,
        );
      continue;
    }
    match = statement.match(/^ALTER\s+TABLE\s+(?:ONLY\s+)?([\w"]+\.[\w"]+)\s+([\s\S]*);$/i);
    if (match) {
      const key = tableKey(match[1]);
      for (const action of splitTopLevel(match[2])) {
        const constraint = action.match(/^ADD\s+CONSTRAINT\s+([\w"]+)\s+([\s\S]+)$/i);
        if (constraint)
          constraints.set(
            `${key}.${constraint[1].replaceAll('"', "")}`,
            `ALTER TABLE ${match[1]} ${action};`,
          );
        const column = action.match(
          /^ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w"]+)\s+([\s\S]+)$/i,
        );
        if (column)
          columns.set(`${key}.${column[1].replaceAll('"', "")}`, {
            table: match[1],
            name: column[1],
            definition: column[2],
          });
      }
      continue;
    }
    match = statement.match(
      /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w"]+)\s+ON\s+([\w"]+\.[\w"]+)/i,
    );
    if (match) {
      indexes.set(`${tableKey(match[2])}.${match[1].replaceAll('"', "")}`, statement);
      continue;
    }
    match = statement.match(/^CREATE\s+TRIGGER\s+([\w"]+)\s+[\s\S]+?\s+ON\s+([\w"]+\.[\w"]+)/i);
    if (match) triggers.set(`${tableKey(match[2])}.${match[1].replaceAll('"', "")}`, statement);
    match = statement.match(
      /^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w"]+)\.([\w"]+)\s*\(([\s\S]*?)\)\s+RETURNS\b/i,
    );
    if (match) {
      const [schema, name] = targetName(`${match[1]}.${match[2]}`);
      functions.set(functionKey(schema, name, functionIdentityArguments(match[3])), statement);
    }
  }
  return {
    tables,
    columns,
    constraints,
    indexes,
    triggers,
    functions,
    inlineConstraints,
    unsupported,
  };
}

function mapBy(items, keyOf) {
  return new Map(items.map((item) => [keyOf(item), item]));
}

/** Plan additive-only DDL. It never emits DROP, ALTER TYPE, or replacement DDL. */
export function planAdditiveSync(baselineSql, canonical, current) {
  const ddl = additionsFromStatements(baselineSql);
  const currentTables = mapBy(current.tables, (item) => `${item.schema}.${item.table}`);
  const canonicalTables = mapBy(canonical.tables, (item) => `${item.schema}.${item.table}`);
  const currentColumns = mapBy(
    current.columns,
    (item) => `${item.schema}.${item.table}.${item.column}`,
  );
  const canonicalColumns = mapBy(
    canonical.columns,
    (item) => `${item.schema}.${item.table}.${item.column}`,
  );
  const currentConstraints = mapBy(
    current.constraints,
    (item) => `${item.schema}.${item.table}.${item.name}`,
  );
  const canonicalConstraints = mapBy(
    canonical.constraints,
    (item) => `${item.schema}.${item.table}.${item.name}`,
  );
  const currentIndexes = mapBy(
    current.indexes,
    (item) => `${item.schema}.${item.table}.${item.name}`,
  );
  const canonicalIndexes = mapBy(
    canonical.indexes,
    (item) => `${item.schema}.${item.table}.${item.name}`,
  );
  const currentTriggers = mapBy(
    current.triggers,
    (item) => `${item.schema}.${item.table}.${item.name}`,
  );
  const canonicalTriggers = mapBy(
    canonical.triggers,
    (item) => `${item.schema}.${item.table}.${item.name}`,
  );
  const currentFunctions = mapBy(current.functions ?? [], (item) =>
    functionKey(item.schema, item.name, item.identityArguments),
  );
  const canonicalFunctions = mapBy(canonical.functions ?? [], (item) =>
    functionKey(item.schema, item.name, item.identityArguments),
  );
  const unsafe = [];
  unsafe.push(...ddl.unsupported);
  const statements = [];
  const pendingTables = new Set();

  for (const [key] of currentColumns) {
    if (!canonicalColumns.has(key))
      unsafe.push(`${key}: local-only column drift; destructive column removal is unsupported`);
  }
  for (const [key, existing] of currentConstraints) {
    if (!canonicalConstraints.has(key))
      unsafe.push(
        `${key}: local-only constraint drift (${existing.definition}); destructive constraint removal is unsupported`,
      );
  }

  for (const [key] of canonicalTables) {
    if (currentTables.has(key)) continue;
    const create = ddl.tables.get(key);
    if (!create)
      unsafe.push(`${key}: canonical table creation is not a recognized additive statement`);
    else {
      pendingTables.add(key);
      statements.push(create);
    }
  }

  const addedColumns = new Set();
  for (const [key, canonicalColumn] of canonicalColumns) {
    const currentColumn = currentColumns.get(key);
    if (currentColumn) {
      if (currentColumn.type !== canonicalColumn.type)
        unsafe.push(`${key}: type drift (${currentColumn.type} != ${canonicalColumn.type})`);
      if (currentColumn.notNull !== canonicalColumn.notNull)
        unsafe.push(`${key}: nullability drift`);
      if (
        currentColumn.identity !== canonicalColumn.identity ||
        currentColumn.generated !== canonicalColumn.generated
      )
        unsafe.push(`${key}: identity/generated drift`);
      if ((currentColumn.default ?? null) !== (canonicalColumn.default ?? null))
        unsafe.push(`${key}: default drift`);
      continue;
    }
    const [schema, table] = key.split(".");
    if (pendingTables.has(`${schema}.${table}`)) continue;
    const addition = ddl.columns.get(key);
    if (!addition) {
      unsafe.push(`${key}: missing column has no recognized ADD COLUMN statement`);
      continue;
    }
    const defaultIsSafe =
      canonicalColumn.default !== null &&
      /^(?:\(?\s*(?:0|1|true|false|null|'[^']*'|"[^"]*")\s*\)?(?:::[\w\s]+)?)$/i.test(
        canonicalColumn.default,
      );
    if (
      canonicalColumn.identity ||
      canonicalColumn.generated ||
      (canonicalColumn.notNull && !defaultIsSafe)
    ) {
      unsafe.push(`${key}: non-null/identity column cannot be added safely to populated table`);
      continue;
    }
    statements.push(
      `ALTER TABLE ${addition.table} ADD COLUMN ${addition.name} ${addition.definition};`,
    );
    addedColumns.add(key);
  }

  const deferredForeignKeys = [];
  for (const [key, constraint] of canonicalConstraints) {
    const existing = currentConstraints.get(key);
    if (existing) {
      if (existing.definition !== constraint.definition)
        unsafe.push(`${key}: constraint definition drift`);
      continue;
    }
    const statement = ddl.constraints.get(key);
    const [schema, table] = key.split(".");
    if (pendingTables.has(`${schema}.${table}`) && ddl.inlineConstraints.has(key)) continue;
    if (pendingTables.has(`${schema}.${table}`) && !statement) continue;
    if (!statement)
      unsafe.push(`${key}: missing constraint has no recognized ADD CONSTRAINT statement`);
    else if (/\bFOREIGN\s+KEY\b/i.test(statement)) deferredForeignKeys.push(statement);
    else statements.push(statement);
  }
  statements.push(...deferredForeignKeys);

  for (const [key, index] of canonicalIndexes) {
    const existing = currentIndexes.get(key);
    if (existing) {
      if (existing.definition !== index.definition) unsafe.push(`${key}: index definition drift`);
      continue;
    }
    const statement = ddl.indexes.get(key);
    const [schema, table] = key.split(".");
    if (canonicalConstraints.has(key) && !currentConstraints.has(key)) continue;
    if (pendingTables.has(`${schema}.${table}`) && !statement && canonicalConstraints.has(key))
      continue;
    if (!statement) unsafe.push(`${key}: missing index has no recognized CREATE INDEX statement`);
    else statements.push(statement);
  }

  // Function definitions are added only when absent; existing functions are
  // never replaced by this development-only additive synchronizer.
  const functionStatements = [];
  for (const [key] of canonicalFunctions) {
    if (currentFunctions.has(key)) continue;
    const statement = ddl.functions.get(key);
    if (!statement)
      unsafe.push(`${key}: missing function has no recognized CREATE FUNCTION statement`);
    else functionStatements.push(statement);
  }
  statements.push(...functionStatements);

  for (const [key, trigger] of canonicalTriggers) {
    const existing = currentTriggers.get(key);
    if (existing) {
      if (existing.definition !== trigger.definition)
        unsafe.push(`${key}: trigger definition drift`);
      continue;
    }
    const statement = ddl.triggers.get(key);
    const [schema, table] = key.split(".");
    if (pendingTables.has(`${schema}.${table}`) && !statement) {
      unsafe.push(`${key}: missing trigger has no recognized CREATE TRIGGER statement`);
      continue;
    }
    if (!statement)
      unsafe.push(`${key}: missing trigger has no recognized CREATE TRIGGER statement`);
    else statements.push(statement);
  }

  return {
    statements,
    unsafe,
    addedColumns: unsafe.length ? [] : [...addedColumns],
    addedTables: unsafe.length ? [] : [...pendingTables],
  };
}

function readSnapshot(database) {
  return JSON.parse(psql(database, ["-At", "-c", schemaSnapshotSql]));
}

function dropReferenceDatabase(name, developmentDatabase) {
  psql(developmentDatabase, [
    "-c",
    `drop database if exists ${quoteIdentifier(name)} with (force)`,
  ]);
}

function syncDevelopmentDatabase({ safeAdditionsOnly = false } = {}) {
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
    const canonical = readSnapshot(reference);
    const current = readSnapshot(database);
    const plan = planAdditiveSync(baseline, canonical, current);
    if (plan.unsafe.length && !safeAdditionsOnly)
      throw new Error(
        `Schema drift needs deliberate review; no changes made: ${plan.unsafe.join(", ")}`,
      );
    if (plan.statements.length) {
      psql(
        database,
        ["-f", "-"],
        `BEGIN;\nSET LOCAL check_function_bodies = false;\n${plan.statements.join("\n")}\nCOMMIT;\n`,
      );
    }
    const remaining = planAdditiveSync(baseline, canonical, readSnapshot(database));
    if (remaining.statements.length || (remaining.unsafe.length && !safeAdditionsOnly))
      throw new Error(
        "Development database synchronization did not converge to the canonical baseline.",
      );
    if (safeAdditionsOnly && remaining.unsafe.length)
      process.stdout.write(
        `Applied ${plan.statements.length} safe additive schema change(s). Existing schema differences remain unchanged: ${remaining.unsafe.join(", ")}\n`,
      );
    else
      process.stdout.write(
        plan.statements.length
          ? `Applied ${plan.statements.length} additive schema change(s) to the local development database.\n`
          : "Development database schema already matches the canonical baseline. No changes made.\n",
      );
  } finally {
    if (referenceCreated) dropReferenceDatabase(reference, database);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  syncDevelopmentDatabase({
    safeAdditionsOnly: process.argv.includes("--safe-additions"),
  });
