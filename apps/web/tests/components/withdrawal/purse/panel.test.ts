import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const panelSource = readFileSync(
  resolve(process.cwd(), "src/components/withdrawal/purse/panel.tsx"),
  "utf8",
);
describe("purse UI contract", () => {
  it("uses Purse terminology and renders a friendly empty state", () => {
    expect(panelSource).toContain('<h2 id="purse-heading">Purse</h2>');
    expect(panelSource).toContain("Save where you want to receive withdrawals.");
    expect(panelSource).toContain("Your purse is empty");
    expect(panelSource).toContain("Add a bank account, crypto wallet");
    expect(panelSource).toContain("Add purse");
    expect(panelSource).not.toContain("Withdrawal methods</h2>");
  });

  it("loads configured methods, keeps unavailable destinations visible and archives with PATCH", () => {
    expect(panelSource).toContain('apiFetch<WithdrawalMethod[]>("/api/withdrawal-methods")');
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
    expect(panelSource).toContain('href="/dashboard/purse/new"');
    expect(panelSource).toContain("/dashboard/purse/${encodeURIComponent(destination.id)}/edit");
    expect(panelSource).not.toContain("Dialog");
    expect(panelSource).not.toContain("image_url");
    expect(panelSource).toContain('method: "PATCH"');
    expect(panelSource).toContain('status: "archived"');
  });
});
