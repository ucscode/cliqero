import { describe, expect, it } from "vitest";
import { presentFundingState } from "@/modules/funding/presentation";

describe("customer funding-state labels", () => {
  it.each([
    ["initialization_pending", "Preparing payment"],
    ["initializing", "Preparing payment"],
    ["verification_pending", "Checking payment"],
    ["reconciliation_pending", "Payment under review"],
  ])("presents %s as %s", (state, label) => {
    expect(presentFundingState(state).label).toBe(label);
  });

  it("does not expose internal state names in the funding-history filters", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(process.cwd(), "src/components/funding/history.tsx"),
      "utf8",
    );

    expect(source).toContain('<option value="verification_pending">Checking payment</option>');
    expect(source).toContain(
      '<option value="reconciliation_pending">Payment under review</option>',
    );
    expect(source).toContain("No payments match this filter.");
    expect(source).not.toContain(">Initializing</option>");
    expect(source).not.toContain(">Verification pending</option>");
    expect(source).not.toContain(">Reconciliation pending</option>");
    expect(source).not.toContain("funding attempts match this filter");
  });
});
