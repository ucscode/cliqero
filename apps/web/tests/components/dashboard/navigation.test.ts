import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  dashboardSectionTitle,
  nextNavigationGroupOpen,
  resolveDashboardSection,
  resolveNavigationGroupOpen,
} from "@/components/dashboard/navigation";

const source = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/navigation.tsx"),
  "utf8",
);
const shellSource = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/shell.tsx"),
  "utf8",
);

describe("dashboard navigation", () => {
  it("resolves only supported customer sections and keeps their titles aligned", () => {
    const sections = [
      "overview",
      "wallet",
      "purchases",
      "promote",
      "hierarchy",
      "referrals",
      "earnings",
      "withdrawals",
      "payout-methods",
      "settings",
    ];

    const titles = [
      "Overview",
      "Wallet",
      "Purchases",
      "Promote",
      "Hierarchy",
      "Referrals",
      "Earnings",
      "Withdrawals",
      "Payout Methods",
      "Settings",
    ];
    for (const [index, section] of sections.entries()) {
      expect(resolveDashboardSection(section, false)).toBe(section);
      expect(dashboardSectionTitle(section)).toBe(titles[index]);
    }
    for (const unknown of ["profile", "whatever"]) {
      const resolved = resolveDashboardSection(unknown, false);
      expect(resolved).toBe("overview");
      expect(dashboardSectionTitle(resolved)).toBe("Overview");
    }
  });

  it("keeps checkout continuation and dedicated route modes ahead of query sections", () => {
    expect(resolveDashboardSection(null, true)).toBe("checkout");
    expect(resolveDashboardSection("wallet", true)).toBe("wallet");
    expect(resolveDashboardSection("profile", true)).toBe("overview");
    expect(resolveDashboardSection("profile", true, { walletFunding: true })).toBe("wallet");
    expect(resolveDashboardSection("profile", true, { fundingHistory: true })).toBe("wallet");
    expect(resolveDashboardSection("profile", true, { withdrawalHistory: true })).toBe(
      "withdrawals",
    );
    expect(resolveDashboardSection("profile", true, { payoutMethodForm: true })).toBe(
      "payout-methods",
    );
  });

  it("uses the resolved section for both the dashboard title and rendered panel", () => {
    expect(shellSource).toContain("const section = resolveDashboardSection(");
    expect(shellSource).toContain("dashboardSectionTitle(section)");
    expect(shellSource).toContain('section === "settings" ? (');
    expect(shellSource).toContain("<DashboardOverview profile={profile} />");
    expect(shellSource).not.toContain('params.get("section") ??');
  });

  it("exposes Promote, Hierarchy, and Referrals as separate sections", () => {
    expect(source).toContain('label: "Promote"');
    expect(source).toContain('label: "Hierarchy"');
    expect(source).toContain('label: "Referrals"');
    expect(source).toContain("/dashboard?section=promote");
    expect(source).toContain("/dashboard?section=hierarchy");
    expect(source).toContain("/dashboard?section=referrals");
    expect(dashboardSectionTitle("hierarchy")).toBe("Hierarchy");
  });

  it("uses Payout Methods in the Money navigation", () => {
    expect(source).toContain('label: "Payout Methods"');
    expect(source).toContain("/dashboard?section=payout-methods");
    expect(dashboardSectionTitle("payout-methods")).toBe("Payout Methods");
    expect(source).not.toContain('label: "Purse"');
  });

  it("defaults active groups open while allowing explicit collapse and reopen", () => {
    expect(resolveNavigationGroupOpen(true, null)).toBe(true);
    expect(nextNavigationGroupOpen(true, null)).toBe(false);
    expect(resolveNavigationGroupOpen(true, false)).toBe(false);
    expect(nextNavigationGroupOpen(true, false)).toBe(true);
    expect(resolveNavigationGroupOpen(true, true)).toBe(true);
    expect(resolveNavigationGroupOpen(false, null)).toBe(false);
  });

  it("opens a group naturally when navigation activates it", () => {
    expect(source).toContain("key={`Money-${section}`}");
    expect(source).toContain("key={`Referrals-${section}`}");
    expect(resolveNavigationGroupOpen(true, null)).toBe(true);
  });

  it("keeps parent toggles understated and synchronizes accessibility and chevron state", () => {
    expect(source).toContain('type="button"');
    expect(source).toContain("aria-expanded={open}");
    expect(source).toContain('${open ? "rotate-180" : ""}');
    expect(source).toContain("isActive={section === item.section}");
    expect(source).toContain('className={active ? "bg-emerald-50');
    expect(source).not.toContain("isActive={active}");
  });
});
