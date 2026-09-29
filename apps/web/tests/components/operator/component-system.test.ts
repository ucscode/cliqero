import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  operatorListingDescriptionForm,
  operatorListingDescriptionPayload,
} from "@/components/operator/catalogue";

const operatorFiles = [
  "shell.tsx",
  "blog/index.tsx",
  "catalogue.tsx",
  "users.tsx",
  "network.tsx",
  "funding.tsx",
  "distributions.tsx",
  "earnings.tsx",
  "withdrawals.tsx",
  "treasury.tsx",
  "reviews.tsx",
];

const operatorRoot = resolve(__dirname, "../../../src/components/operator");

describe("operator component-system migration", () => {
  it("imports generic primitives directly from components/ui", () => {
    for (const file of operatorFiles) {
      const source = readFileSync(resolve(operatorRoot, file), "utf8");
      expect(source, file).not.toMatch(/from ["']\.\/ui["']/);
    }
  });

  it.each([
    ["treasury.tsx", "Treasury"],
    ["earnings.tsx", "Earnings"],
    ["distributions.tsx", "Distributions"],
    ["withdrawals.tsx", "Withdrawals"],
  ])("keeps %s selectable without adding unsafe bulk deletion", (file) => {
    const source = readFileSync(resolve(operatorRoot, file), "utf8");
    expect(source, file).toContain("selection={{");
    expect(source, file).not.toContain('value: "delete"');
  });

  it("limits account bulk deletion to account managers", () => {
    const source = readFileSync(resolve(operatorRoot, "users.tsx"), "utf8");
    expect(source).toContain("canManage && onBulkDelete");
    expect(source).toContain('value: "delete"');
    expect(source).toContain('action: "delete"');
  });

  it("uses the shared Sidebar composition for operator navigation", () => {
    const source = readFileSync(resolve(operatorRoot, "shell.tsx"), "utf8");
    expect(source).toContain("SidebarProvider");
    expect(source).toContain("SidebarMenuButton");
    expect(source).not.toContain("operator-sidebar");
    expect(source).not.toContain("Operational view");
    expect(source).not.toContain("<h1");
    expect(source).toContain("Open operator account menu");
    expect(source).toContain("Open operator navigation");
  });

  it("uses CrudFieldList terminology without retaining CrudDetails references", () => {
    const sourceFiles = [
      resolve(operatorRoot, "users.tsx"),
      resolve(__dirname, "../../../src/components/crud/detail.tsx"),
      resolve(__dirname, "../../../src/components/crud/field-list.tsx"),
    ];
    const sources = sourceFiles.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(sources).toContain("CrudFieldList");
    expect(sources).not.toContain("CrudDetails");
  });

  it("has no deprecated Badge tone compatibility prop", () => {
    const source = readFileSync(resolve(__dirname, "../../../src/components/ui/badge.tsx"), "utf8");
    expect(source).not.toContain("tone?");
    expect(source).not.toContain("deprecated");
  });

  it("does not reintroduce deleted generic CSS infrastructure", () => {
    const css = readFileSync(resolve(__dirname, "../../../src/app/styles.css"), "utf8");
    for (const selector of [".button {", ".input {", ".card {", ".skeleton {"]) {
      expect(css).not.toContain(selector);
    }
  });

  it("loads and submits short and long descriptions independently", () => {
    const form = operatorListingDescriptionForm({
      short_description: "Quick summary",
      long_description: "Full Markdown details",
    });
    expect(form).toEqual({
      shortDescription: "Quick summary",
      longDescription: "Full Markdown details",
    });
    expect(operatorListingDescriptionPayload(form)).toEqual({
      short_description: "Quick summary",
      long_description: "Full Markdown details",
    });
  });
});
