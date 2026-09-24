import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const panelSource = readFileSync(
  resolve(process.cwd(), "src/components/withdrawal/payout-methods/panel.tsx"),
  "utf8",
);
describe("Payout Methods UI contract", () => {
  it("uses Payout Methods terminology and renders the specified empty state", () => {
    expect(panelSource).toContain('aria-label="Payout Methods"');
    expect(panelSource).toContain("Manage where you receive withdrawals.");
    expect(panelSource).toContain("No payout methods saved");
    expect(panelSource).toContain("Add a bank account, crypto wallet");
    expect(panelSource).toContain("Add payout method");
    expect(panelSource).not.toContain("Purse");
    expect(panelSource).not.toContain("Withdrawal methods</h2>");
  });

  it("loads configured methods, keeps unavailable destinations visible and archives with PATCH", () => {
    expect(panelSource).toContain('apiFetch<WithdrawalMethod[]>("/api/withdrawal-methods")');
    expect(panelSource).toContain("WithdrawalDestination");
    expect(panelSource).toContain(
      'apiFetch<WithdrawalDestination[]>("/api/withdrawal-destinations")',
    );
    expect(panelSource).toContain("Unavailable for new withdrawals");
    expect(panelSource).toContain('method: "PATCH"');
    expect(panelSource).toContain('status: "archived"');
    expect(panelSource).not.toContain('method: "DELETE"');
    expect(panelSource).not.toContain("/archive");
  });

  it("uses dedicated add/edit pages and keeps removal as an archive PATCH", () => {
    expect(panelSource).toContain('href="/dashboard/payout-methods/new"');
    expect(panelSource).toContain(
      "/dashboard/payout-methods/${encodeURIComponent(destination.id)}/edit",
    );
    expect(panelSource).not.toContain("Dialog");
    expect(panelSource).not.toContain("image_url");
    expect(panelSource).toContain('method: "PATCH"');
    expect(panelSource).toContain('status: "archived"');
  });

  it("hides server-owned fields and does not offer customer copy actions", () => {
    expect(panelSource).toContain('field.type !== "hidden"');
    expect(panelSource).not.toContain("CopyValue");
    expect(panelSource).toContain("field.displayValue ?? field.value");
  });

  it("places subdued method metadata above the wrapping saved name and keeps actions at the top right", () => {
    const cardStart = panelSource.indexOf("<Card key={destination.id}");
    const methodName = panelSource.indexOf("{destination.method.display_name}", cardStart);
    const savedName = panelSource.indexOf("{destination.name}", cardStart);
    expect(methodName).toBeGreaterThan(cardStart);
    expect(methodName).toBeLessThan(savedName);
    expect(panelSource).toContain('className="mt-1 break-words"');
    expect(panelSource).toContain("flex items-start justify-between gap-3");
    expect(panelSource).toContain("flex shrink-0 items-start gap-2");
    expect(panelSource).toContain("Unavailable for new withdrawals");
  });
});
