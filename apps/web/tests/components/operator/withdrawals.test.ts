import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  operatorWithdrawalDeleteAllowed,
  operatorWithdrawalEditPolicy,
} from "@/components/operator/withdrawals";

const source = readFileSync(
  resolve(__dirname, "../../../src/components/operator/withdrawals.tsx"),
  "utf8",
);

describe("operator manual withdrawal workflow", () => {
  it("exposes only legitimate edit fields and transitions for each withdrawal state", () => {
    expect(operatorWithdrawalEditPolicy("requested")).toEqual({
      editable: true,
      amountAndDestinationLocked: false,
      stateOptions: ["requested", "approved", "rejected"],
    });
    expect(operatorWithdrawalEditPolicy("approved")).toEqual({
      editable: true,
      amountAndDestinationLocked: true,
      stateOptions: ["approved", "rejected"],
    });
    for (const state of ["completed", "rejected", "cancelled", "failed"] as const)
      expect(operatorWithdrawalEditPolicy(state)).toMatchObject({
        editable: false,
        stateOptions: [],
      });
    expect(source).toContain("Mark as paid");
  });
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

  it("lets system.root delete every withdrawal state while preserving ordinary restrictions", () => {
    expect(operatorWithdrawalDeleteAllowed("completed", true, true)).toBe(true);
    expect(operatorWithdrawalDeleteAllowed("completed", true, false)).toBe(false);
    expect(operatorWithdrawalDeleteAllowed("requested", true, false)).toBe(true);
    expect(operatorWithdrawalDeleteAllowed("requested", false, false)).toBe(false);
  });
});
