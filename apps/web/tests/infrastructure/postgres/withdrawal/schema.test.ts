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

  it("keeps withdrawal policy in configuration rather than the database", () => {
    expect(schema).not.toContain("withdrawal_capability.policy");
    expect(schema).not.toContain("withdrawal_policy_min_positive");
    expect(schema).toContain("CREATE TABLE withdrawal_capability.withdrawals");
    expect(schema).toContain("CREATE TABLE withdrawal_capability.destinations");
  });

  it("stores owned destinations and immutable withdrawal snapshots without free-form fields", () => {
    expect(schema).toContain("CREATE TABLE withdrawal_capability.destinations");
    expect(schema).toContain("destinations_account_fk FOREIGN KEY (account_id)");
    expect(schema).toContain("destinations_uuid_unique UNIQUE (uuid)");
    expect(schema).toContain("destinations_status_valid CHECK");
    expect(schema).toContain("details jsonb NOT NULL");
    expect(schema).toContain("destination_details jsonb NOT NULL");
    expect(schema).toContain("withdrawals_saved_destination_owner_fk");
    expect(schema).toContain("withdrawals_destination_snapshot_guard");
    expect(schema).not.toContain("destination_type text NOT NULL");
    expect(schema).not.toContain("destination_reference text NOT NULL");
  });

  it("uniquely scopes withdrawal idempotency keys to their account", () => {
    expect(schema).toContain(
      "ADD CONSTRAINT withdrawals_account_idempotency_key_key UNIQUE (account_id, idempotency_key)",
    );
    expect(schema).not.toMatch(
      /ADD CONSTRAINT withdrawals_idempotency_key_key UNIQUE \(idempotency_key\)/,
    );
  });
});
