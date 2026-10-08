import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("canonical finance ledger schema", () => {
  const schema = readFileSync(
    resolve(process.cwd(), "../../database/migrations/001_initial_schema.sql"),
    "utf8",
  );

  it("defines signed, append-only USD earnings adjustments with actor and account audit", () => {
    const start = schema.indexOf("CREATE TABLE ledger_capability.earnings_adjustments");
    const end = schema.indexOf("CREATE TABLE ", start + 1);
    const table = schema.slice(start, end);
    expect(table).toContain("amount_minor bigint NOT NULL");
    expect(table).toContain("reason text NOT NULL");
    expect(table).toContain("reference text");
    expect(table).toContain("created_by bigint NOT NULL");
    expect(table).toContain("earnings_adjustments_nonzero CHECK (amount_minor <> 0)");
    expect(table).toContain("earnings_adjustments_append_only");
    expect(table).not.toContain("purchase_id");
    expect(table).not.toContain("distribution_id");
    expect(table).not.toContain("currency text");
  });

  it("ties wallet transfers to immutable funding legs and a stable operation correlation", () => {
    expect(schema).toContain("CREATE TABLE wallet_capability.transfers");
    expect(schema).toContain(
      "wallet_transfers_idempotency_unique UNIQUE (account_id, idempotency_key)",
    );
    expect(schema).toContain("wallet_transfers_correlation_unique UNIQUE (correlation_id)");
    expect(schema).toContain("CREATE TABLE wallet_capability.transfer_entries");
    expect(schema).toContain("wallet_transfer_entries_append_only");
    expect(schema).toContain("wallet_transfer_entries_correlation_idx");
  });

  it("keeps administrative Funding idempotency globally unique without rewriting historical rows", () => {
    const table = schema.slice(
      schema.indexOf("CREATE TABLE funding_capability.administrative_fundings"),
    );
    expect(table).toContain("idempotency_key text");
    expect(table).toContain("administrative_fundings_idempotency_unique");
    expect(table).toContain("WHERE idempotency_key IS NOT NULL");
  });
});
