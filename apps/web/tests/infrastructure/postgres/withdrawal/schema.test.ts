import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("canonical withdrawal schema", () => {
  const schema = readFileSync(
    resolve(process.cwd(), "../../database/migrations/001_initial_schema.sql"),
    "utf8",
  );

  it("keeps manual completion facts on withdrawals", () => {
    expect(schema).toContain("external_reference text,");
    expect(schema).toContain("completion_note text,");
    expect(schema).toContain("completed_by bigint,");
    expect(schema).toContain("completed_at timestamp with time zone,");
    expect(schema).toContain("ADD CONSTRAINT withdrawals_completed_by_fk");
  });

  it("does not define the removed outbound payout schema", () => {
    expect(schema).not.toContain("payout_capability");
    expect(schema).not.toContain("payout_recipients");
    expect(schema).not.toContain("payout_executions");
  });
});
