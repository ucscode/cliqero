import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dashboardSectionTitle } from "@/components/dashboard/navigation";

const source = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/navigation.tsx"),
  "utf8",
);

describe("dashboard navigation", () => {
  it("exposes Promote, Hierarchy, and Referrals as separate sections", () => {
    expect(source).toContain('label: "Promote"');
    expect(source).toContain('label: "Hierarchy"');
    expect(source).toContain('label: "Referrals"');
    expect(source).toContain("/dashboard?section=promote");
    expect(source).toContain("/dashboard?section=hierarchy");
    expect(source).toContain("/dashboard?section=referrals");
    expect(dashboardSectionTitle("hierarchy")).toBe("Hierarchy");
  });

  it("includes withdrawal methods in Money navigation", () => {
    expect(source).toContain('label: "Withdrawal methods"');
    expect(source).toContain("/dashboard?section=withdrawal-methods");
    expect(dashboardSectionTitle("withdrawal-methods")).toBe("Withdrawal methods");
  });
});
