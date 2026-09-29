import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("canonical checkout and wallet schema", () => {
  const schema = readFileSync(
    resolve(process.cwd(), "../../database/migrations/001_initial_schema.sql"),
    "utf8",
  );

  it("permits zero checkout amounts while retaining positive-only wallet movements", () => {
    expect(schema).toContain("CONSTRAINT checkout_amount_nonnegative CHECK ((amount_minor >= 0))");
    expect(schema).not.toContain("CONSTRAINT checkout_amount_positive");
    expect(schema).toContain("CONSTRAINT wallet_debit_positive CHECK ((amount_minor > 0))");
    expect(schema).toContain("CONSTRAINT wallet_credit_positive CHECK ((amount_minor > 0))");
    expect(schema).toContain(
      "CONSTRAINT purchases_prices_nonnegative CHECK (((price_minor_snapshot >= 0) AND (canonical_minor_snapshot >= 0)))",
    );
  });
});
