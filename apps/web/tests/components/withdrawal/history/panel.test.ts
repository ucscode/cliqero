import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/components/withdrawal/history/panel.tsx"),
  "utf8",
);
const route = readFileSync(
  resolve(process.cwd(), "src/app/dashboard/withdrawals/history/page.tsx"),
  "utf8",
);

describe("customer withdrawal history page", () => {
  it("uses the dashboard shell and a real 25-row cursor page with back/next navigation", () => {
    expect(route).toContain("<DashboardShell withdrawalHistoryPage />");
    expect(source).toContain("WITHDRAWAL_HISTORY_PAGE_SIZE = 25");
    expect(source).toContain("/api/withdrawals?${query}");
    expect(source).toContain('query.set("cursor", nextCursor)');
    expect(source).toContain("setPreviousCursors((current) => [...current, cursor])");
    expect(source).toContain("Back to Withdrawals");
    expect(source).toContain("Previous");
    expect(source).toContain("Next");
  });

  it("preserves cancellation and status/reason display through the shared history list", () => {
    expect(source).not.toContain("window.confirm");
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain('JSON.stringify({ status: "cancelled" })');
    expect(source).toContain("Cancel withdrawal request?");
    expect(source).toContain("Keep request");
    expect(source).toContain("onCancel={setWithdrawalToCancel}");
    expect(source).toContain(
      "<WithdrawalHistoryList\n            withdrawals={page?.withdrawals ?? []}\n            onCancel={setWithdrawalToCancel}\n          />",
    );
  });
});
