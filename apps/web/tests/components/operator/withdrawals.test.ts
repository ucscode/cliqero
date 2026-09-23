import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "../../../src/components/operator/withdrawals.tsx"),
  "utf8",
);

describe("operator manual withdrawal workflow", () => {
  it("records already-sent payments through the withdrawal PATCH resource", () => {
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain("external_reference: externalReference.trim()");
    expect(source).toContain("note: completionNote.trim()");
    expect(source).toContain("Send the payment outside Cliqero first");
    expect(source).toContain("Mark as paid");
  });

  it("does not render automatic execution, retry, reconciliation, or attempt history", () => {
    for (const removedLabel of [
      "Execute payout",
      "Retry payout",
      "Reconcile payout",
      "Payout execution",
      "Attempt history",
    ]) {
      expect(source).not.toContain(removedLabel);
    }
  });
});
