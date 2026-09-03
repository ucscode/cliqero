import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const operatorFiles = [
  "operator-shell.tsx",
  "operator-catalogue.tsx",
  "operator-users.tsx",
  "operator-network.tsx",
  "operator-funding.tsx",
  "operator-distributions.tsx",
  "operator-earnings.tsx",
  "operator-withdrawals.tsx",
  "operator-treasury.tsx",
];

describe("operator component-system migration", () => {
  it("imports generic primitives directly from components/ui", () => {
    for (const file of operatorFiles) {
      const source = readFileSync(resolve(__dirname, file), "utf8");
      expect(source, file).not.toMatch(/from ["']\.\/ui["']/);
    }
  });

  it("uses the shared Sidebar composition for operator navigation", () => {
    const source = readFileSync(resolve(__dirname, "operator-shell.tsx"), "utf8");
    expect(source).toContain("SidebarProvider");
    expect(source).toContain("SidebarMenuButton");
    expect(source).not.toContain("operator-sidebar");
  });

  it("has no deprecated Badge tone compatibility prop", () => {
    const source = readFileSync(resolve(__dirname, "ui/badge.tsx"), "utf8");
    expect(source).not.toContain("tone?");
    expect(source).not.toContain("deprecated");
  });

  it("does not reintroduce deleted generic CSS infrastructure", () => {
    const css = readFileSync(resolve(__dirname, "../app/styles.css"), "utf8");
    for (const selector of [".button {", ".input {", ".card {", ".skeleton {"]) {
      expect(css).not.toContain(selector);
    }
  });
});
