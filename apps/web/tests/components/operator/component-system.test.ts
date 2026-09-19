import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  operatorListingDescriptionForm,
  operatorListingDescriptionPayload,
} from "@/components/operator/catalogue";

const operatorFiles = [
  "shell.tsx",
  "catalogue.tsx",
  "users.tsx",
  "network.tsx",
  "funding.tsx",
  "distributions.tsx",
  "earnings.tsx",
  "withdrawals.tsx",
  "treasury.tsx",
];

const operatorRoot = resolve(__dirname, "../../../src/components/operator");

describe("operator component-system migration", () => {
  it("imports generic primitives directly from components/ui", () => {
    for (const file of operatorFiles) {
      const source = readFileSync(resolve(operatorRoot, file), "utf8");
      expect(source, file).not.toMatch(/from ["']\.\/ui["']/);
    }
  });

  it("uses the shared Sidebar composition for operator navigation", () => {
    const source = readFileSync(resolve(operatorRoot, "shell.tsx"), "utf8");
    expect(source).toContain("SidebarProvider");
    expect(source).toContain("SidebarMenuButton");
    expect(source).not.toContain("operator-sidebar");
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
