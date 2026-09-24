import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/components/withdrawal/panel.tsx"), "utf8");

describe("withdrawal request UI contract", () => {
  it("uses saved destinations and submits only their ID with amount and currency", () => {
    expect(source).toContain('"/api/withdrawal-destinations"');
    expect(source).toContain("destination_id: destination");
    expect(source).toContain("amount_minor: amountMinor");
    expect(source).toContain("currency,");
    expect(source).toContain("No payout method is available for withdrawals.");
    expect(source).toContain("/dashboard/payout-methods/new");
    expect(source).toContain("Add payout method");
    expect(source).not.toContain("Payout destination reference");
    expect(source).not.toContain("destination_reference");
    expect(source).not.toContain("destination_type");
  });

  it("uses general available-earnings wording and safe destination identity in history", () => {
    expect(source).toContain("available earnings");
    expect(source).toContain("withdrawal.destination.method_name");
    expect(source).toContain("withdrawal.destination.name");
    expect(source).not.toContain("settled referral earnings");
  });
});
