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
).replace(/\s+/g, " ");

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
    expect(operatorWithdrawalEditPolicy("approved", true)).toEqual({
      editable: false,
      amountAndDestinationLocked: true,
      stateOptions: [],
    });
    expect(operatorWithdrawalDeleteAllowed("completed", true, true, true)).toBe(false);
    expect(operatorWithdrawalDeleteAllowed("approved", true, true)).toBe(true);
    for (const state of ["completed", "rejected", "cancelled", "failed"] as const)
      expect(operatorWithdrawalEditPolicy(state)).toMatchObject({
        editable: false,
        stateOptions: [],
      });
    expect(source).toContain("Record confirmed payout");
  });
  it("separates initiation from outcome reconciliation in the Operator detail workflow", () => {
    expect(source).toContain("Approved, payout initiation not recorded.");
    expect(source).toContain("Recording initiation runs the debt check and attests that you are");
    expect(source).toContain(
      "starting the payout workflow; it does not prove provider acceptance or settlement.",
    );
    expect(source).toContain("/api/withdrawals/${withdrawalId}/${operation}");
    expect(source).toContain("Start payout workflow");
    expect(source).toContain("Payout workflow started, awaiting authoritative external outcome.");
    expect(source).toContain("Record confirmed payout");
    expect(source).toContain("Record confirmed payout failure");
    expect(source).not.toContain("/internal/withdrawals/${withdrawalId}/complete");
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
