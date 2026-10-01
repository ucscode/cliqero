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
