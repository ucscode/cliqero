import assert from "node:assert/strict";
import test from "node:test";
import { planAdditiveSync, splitSqlStatements } from "./dev-database-sync.mjs";

test("SQL splitting preserves semicolons inside strings and function bodies", () => {
  const statements = splitSqlStatements(`
    CREATE TABLE sample.items (name text DEFAULT 'a;b');
    CREATE FUNCTION sample.noop() RETURNS void AS $body$ BEGIN RAISE NOTICE 'x;y'; END $body$ LANGUAGE plpgsql;
  `);
  assert.equal(statements.length, 2);
});

test("safe planner adds missing function definitions without replacing existing ones", () => {
  const sql = `
    CREATE FUNCTION ledger_capability.available_earnings_minor(p_account_id bigint, p_currency text DEFAULT 'USD')
    RETURNS bigint LANGUAGE sql STABLE AS $$ SELECT p_account_id WHERE p_currency = 'USD' $$;
  `;
  const canonical = {
    tables: [],
    columns: [],
    constraints: [],
    indexes: [],
    triggers: [],
    functions: [
      {
        schema: "ledger_capability",
        name: "available_earnings_minor",
        identityArguments: "p_account_id bigint, p_currency text",
      },
    ],
  };
  const current = { ...canonical, functions: [] };
  const missing = planAdditiveSync(sql, canonical, current);
  assert.deepEqual(missing.unsafe, []);
  assert.equal(missing.statements.length, 1);
  assert.match(
    missing.statements[0],
    /^CREATE FUNCTION ledger_capability\.available_earnings_minor/,
  );

  const present = planAdditiveSync(sql, canonical, {
    ...current,
    functions: canonical.functions,
  });
  assert.deepEqual(present.unsafe, []);
  assert.deepEqual(present.statements, []);
});

test("planner can add a nullable column and check declared inline in CREATE TABLE", () => {
  const sql = `
    CREATE TABLE treasury_capability.entries (
      id bigint NOT NULL,
      actor_kind text,
      CONSTRAINT actor_kind_valid CHECK (actor_kind IS NULL OR actor_kind IN ('customer','operator','system'))
    );
  `;
  const canonical = {
    tables: [{ schema: "treasury_capability", table: "entries" }],
    columns: [
      {
        schema: "treasury_capability",
        table: "entries",
        column: "id",
        type: "bigint",
        notNull: true,
        default: null,
        identity: "",
        generated: "",
      },
      {
        schema: "treasury_capability",
        table: "entries",
        column: "actor_kind",
        type: "text",
        notNull: false,
        default: null,
        identity: "",
        generated: "",
      },
    ],
    constraints: [
      {
        schema: "treasury_capability",
        table: "entries",
        name: "actor_kind_valid",
        definition:
          "CHECK ((actor_kind IS NULL) OR (actor_kind = ANY (ARRAY['customer'::text, 'operator'::text, 'system'::text])))",
      },
    ],
    indexes: [],
    triggers: [],
    functions: [],
  };
  const current = {
    ...canonical,
    tables: canonical.tables,
    columns: canonical.columns.filter((column) => column.column === "id"),
    constraints: [],
  };
  const plan = planAdditiveSync(sql, canonical, current);
  assert.deepEqual(plan.unsafe, []);
  assert.ok(
    plan.statements.includes("ALTER TABLE treasury_capability.entries ADD COLUMN actor_kind text;"),
  );
  assert.ok(
    plan.statements.some((statement) =>
      statement.includes("ADD CONSTRAINT actor_kind_valid CHECK"),
    ),
  );
});

test("planner creates referenced unique keys before deferring new foreign keys", () => {
  const sql = `
    CREATE TABLE sample.transfers (id bigint PRIMARY KEY, account_id bigint);
    ALTER TABLE sample.transfers ADD CONSTRAINT transfer_id_account_unique UNIQUE (id, account_id);
    CREATE TABLE sample.compensations (
      transfer_id bigint NOT NULL,
      account_id bigint NOT NULL,
      CONSTRAINT compensation_transfer_fk FOREIGN KEY (transfer_id, account_id)
        REFERENCES sample.transfers(id, account_id)
    );
  `;
  const canonical = {
    tables: [
      { schema: "sample", table: "transfers" },
      { schema: "sample", table: "compensations" },
    ],
    columns: [],
    constraints: [
      {
        schema: "sample",
        table: "transfers",
        name: "transfer_id_account_unique",
        definition: "UNIQUE (id, account_id)",
      },
      {
        schema: "sample",
        table: "compensations",
        name: "compensation_transfer_fk",
        definition:
          "FOREIGN KEY (transfer_id, account_id) REFERENCES sample.transfers(id, account_id)",
      },
    ],
    indexes: [],
    triggers: [],
    functions: [],
  };
  const current = { ...canonical, tables: [canonical.tables[0]], constraints: [] };
  const plan = planAdditiveSync(sql, canonical, current);
  assert.deepEqual(plan.unsafe, []);
  const createCompensations = plan.statements.findIndex((statement) =>
    statement.startsWith("CREATE TABLE sample.compensations"),
  );
  const addUnique = plan.statements.findIndex((statement) =>
    statement.includes("ADD CONSTRAINT transfer_id_account_unique"),
  );
  const addForeignKey = plan.statements.findIndex((statement) =>
    statement.includes("ADD CONSTRAINT compensation_transfer_fk"),
  );
  assert.ok(createCompensations >= 0 && addUnique > createCompensations);
  assert.ok(addForeignKey > addUnique);
  assert.doesNotMatch(plan.statements[createCompensations], /FOREIGN KEY/i);
});

test("safe planner adds a missing table, nullable column, and index, then converges", () => {
  const sql = `
    CREATE TABLE sample.adjustments (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, amount bigint);
    CREATE INDEX adjustments_amount_idx ON sample.adjustments (amount);
    ALTER TABLE sample.adjustments ADD CONSTRAINT adjustments_amount_nonzero CHECK (amount <> 0);
    ALTER TABLE sample.items ADD COLUMN note text;
  `;
  const canonical = {
    tables: [
      { schema: "sample", table: "items" },
      { schema: "sample", table: "adjustments" },
    ],
    columns: [
      {
        schema: "sample",
        table: "items",
        column: "id",
        type: "bigint",
        notNull: true,
        default: null,
        identity: "",
        generated: "",
      },
      {
        schema: "sample",
        table: "items",
        column: "note",
        type: "text",
        notNull: false,
        default: null,
        identity: "",
        generated: "",
      },
      {
        schema: "sample",
        table: "adjustments",
        column: "id",
        type: "bigint",
        notNull: true,
        default: null,
        identity: "a",
        generated: "",
      },
      {
        schema: "sample",
        table: "adjustments",
        column: "amount",
        type: "bigint",
        notNull: false,
        default: null,
        identity: "",
        generated: "",
      },
    ],
    constraints: [
      {
        schema: "sample",
        table: "adjustments",
        name: "adjustments_pkey",
        definition: "PRIMARY KEY (id)",
      },
      {
        schema: "sample",
        table: "adjustments",
        name: "adjustments_amount_nonzero",
        definition: "CHECK ((amount <> 0))",
      },
    ],
    indexes: [
      {
        schema: "sample",
        table: "adjustments",
        name: "adjustments_pkey",
        definition: "CREATE UNIQUE INDEX adjustments_pkey ON sample.adjustments USING btree (id)",
      },
      {
        schema: "sample",
        table: "adjustments",
        name: "adjustments_amount_idx",
        definition:
          "CREATE INDEX adjustments_amount_idx ON sample.adjustments USING btree (amount)",
      },
    ],
    triggers: [],
  };
  const current = {
    tables: [{ schema: "sample", table: "items" }],
    columns: [
      {
        schema: "sample",
        table: "items",
        column: "id",
        type: "bigint",
        notNull: true,
        default: null,
        identity: "",
        generated: "",
      },
    ],
    constraints: [],
    indexes: [],
    triggers: [],
  };
  const plan = planAdditiveSync(sql, canonical, current);
  assert.deepEqual(plan.unsafe, []);
  assert.deepEqual(plan.addedTables, ["sample.adjustments"]);
  assert.deepEqual(plan.addedColumns, ["sample.items.note"]);
  assert.ok(
    plan.statements.some((statement) => statement.startsWith("CREATE TABLE sample.adjustments")),
  );
  assert.ok(plan.statements.some((statement) => statement.includes("ADD COLUMN note text")));
  assert.ok(
    plan.statements.includes("CREATE INDEX adjustments_amount_idx ON sample.adjustments (amount);"),
  );
  assert.equal(
    plan.statements.filter((statement) => statement.includes("adjustments_pkey")).length,
    0,
  );
});

test("planner refuses type changes and unsafe NOT NULL additions without applying DDL", () => {
  const canonical = {
    tables: [{ schema: "sample", table: "items" }],
    columns: [
      {
        schema: "sample",
        table: "items",
        column: "id",
        type: "bigint",
        notNull: true,
        default: null,
        identity: "",
        generated: "",
      },
      {
        schema: "sample",
        table: "items",
        column: "required_value",
        type: "text",
        notNull: true,
        default: null,
        identity: "",
        generated: "",
      },
    ],
    constraints: [],
    indexes: [],
    triggers: [],
  };
  const current = {
    tables: canonical.tables,
    columns: [
      {
        schema: "sample",
        table: "items",
        column: "id",
        type: "integer",
        notNull: true,
        default: null,
        identity: "",
        generated: "",
      },
    ],
    constraints: [],
    indexes: [],
    triggers: [],
  };
  const plan = planAdditiveSync(
    "ALTER TABLE sample.items ADD COLUMN required_value text NOT NULL;",
    canonical,
    current,
  );
  assert.equal(plan.statements.length, 0);
  assert.ok(plan.unsafe.some((entry) => entry.includes("type drift")));
  assert.ok(plan.unsafe.some((entry) => entry.includes("cannot be added safely")));
});

test("planner refuses a baseline column removal without producing destructive DDL", () => {
  const canonical = {
    tables: [{ schema: "sample", table: "items" }],
    columns: [
      {
        schema: "sample",
        table: "items",
        column: "id",
        type: "bigint",
        notNull: true,
        default: null,
        identity: "",
        generated: "",
      },
    ],
    constraints: [],
    indexes: [],
    triggers: [],
  };
  const current = {
    ...canonical,
    columns: [
      ...canonical.columns,
      {
        schema: "sample",
        table: "items",
        column: "local_note",
        type: "text",
        notNull: false,
        default: null,
        identity: "",
        generated: "",
      },
    ],
  };
  const plan = planAdditiveSync("", canonical, current);
  assert.deepEqual(plan.statements, []);
  assert.ok(
    plan.unsafe.some((entry) => entry.includes("destructive column removal is unsupported")),
  );
  assert.ok(!plan.statements.some((statement) => /\bDROP\b/i.test(statement)));
});

test("safe additions remain available beside unrelated constraint drift", () => {
  const canonical = {
    tables: [{ schema: "sample", table: "items" }],
    columns: [
      {
        schema: "sample",
        table: "items",
        column: "id",
        type: "bigint",
        notNull: true,
        default: null,
        identity: "",
        generated: "",
      },
      {
        schema: "sample",
        table: "items",
        column: "note",
        type: "text",
        notNull: false,
        default: null,
        identity: "",
        generated: "",
      },
    ],
    constraints: [
      {
        schema: "sample",
        table: "items",
        name: "items_state_valid",
        definition: "CHECK (state IN ('ready', 'done'))",
      },
    ],
    indexes: [],
    triggers: [],
    functions: [],
  };
  const current = {
    ...canonical,
    columns: canonical.columns.slice(0, 1),
    constraints: [
      {
        ...canonical.constraints[0],
        definition: "CHECK (state IN ('ready'))",
      },
    ],
  };
  const plan = planAdditiveSync(
    "ALTER TABLE sample.items ADD COLUMN note text;",
    canonical,
    current,
  );
  assert.equal(plan.unsafe.length, 1);
  assert.match(plan.unsafe[0], /constraint definition drift/);
  assert.deepEqual(plan.statements, ["ALTER TABLE sample.items ADD COLUMN note text;"]);
});

test("safe planner refuses to create a table after dropping an unsupported foreign key", () => {
  const canonical = {
    tables: [{ schema: "sample", table: "items" }],
    columns: [],
    constraints: [],
    indexes: [],
    triggers: [],
    functions: [],
  };
  const plan = planAdditiveSync(
    "CREATE TABLE sample.items (id bigint, FOREIGN KEY (parent_id) REFERENCES sample.parents(id));",
    canonical,
    { ...canonical, tables: [] },
  );
  assert.ok(plan.unsafe.some((issue) => issue.includes("unnamed inline foreign key")));
  assert.ok(
    !plan.statements.some((statement) => statement.startsWith("CREATE TABLE sample.items")),
  );
});
