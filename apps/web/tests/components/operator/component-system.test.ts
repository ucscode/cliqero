import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
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

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("operator component-system migration", () => {
  it("imports generic primitives directly from components/ui", () => {
    for (const file of operatorFiles) {
      const source = readFileSync(resolve(operatorRoot, file), "utf8");
      expect(source, file).not.toMatch(/from ["']\.\/ui["']/);
    }
  });

  it("offers withdrawal bulk Delete through one internal server workflow", () => {
    const file = "withdrawals.tsx";
    const source = readFileSync(resolve(operatorRoot, file), "utf8");
    expect(source, file).toContain("selection={{");
    expect(source, file).toContain('value: "delete"');
    expect(source, file).toContain("/internal/withdrawals/bulk-delete");
  });

  it("keeps every Operator record table root-deletable through shared selection", () => {
    const tables = [
      ["catalogue.tsx", "runOperatorBulkAction", "catalogue/page.tsx"],
      ["catalogue/categories.tsx", "runOperatorBulkAction", "catalogue/categories/page.tsx"],
      ["reviews.tsx", "runOperatorBulkAction", "reviews/page.tsx"],
      ["users.tsx", "runOperatorBulkAction", "users/page.tsx"],
      ["api-keys/collection.tsx", "/internal/api-keys/actions/delete", "api-keys/page.tsx"],
      ["purchases.tsx", "runOperatorBulkAction", "purchases/page.tsx"],
      ["funding.tsx", "/api/funding-transactions", "funding/page.tsx"],
      ["distributions.tsx", "runOperatorBulkAction", "distributions/page.tsx"],
      ["earnings.tsx", "runOperatorBulkAction", "earnings/page.tsx"],
      ["earnings-adjustments.tsx", "runOperatorBulkAction", "earnings-adjustments/page.tsx"],
      ["withdrawals.tsx", "/internal/withdrawals/bulk-delete", "withdrawals/page.tsx"],
      ["treasury.tsx", "runOperatorBulkAction", "treasury/page.tsx"],
      ["blog/index.tsx", "runOperatorBulkAction", "blog/page.tsx"],
      ["blog/categories.tsx", "runOperatorBulkAction", "blog/categories/page.tsx"],
    ] as const;
    const inventoryFiles = new Set(tables.map(([file]) => resolve(operatorRoot, file)));
    const renderedTableFiles = filesUnder(operatorRoot).filter((file) =>
      readFileSync(file, "utf8").includes("<CrudIndex"),
    );

    expect(renderedTableFiles.sort()).toEqual([...inventoryFiles].sort());

    for (const [file, bulkPath, page] of tables) {
      const source = readFileSync(resolve(operatorRoot, file), "utf8");
      expect(source, file).toContain("selection=");
      expect(source, file).toContain('label: "Delete"');
      expect(source, file).toContain(bulkPath);
      expect(source, file).toContain("canDelete");
      const pageSource = readFileSync(
        resolve(__dirname, `../../../src/app/operator/${page}`),
        "utf8",
      );
      expect(pageSource, page).toContain('hasCapability(access.capabilities, "system.root")');
    }
  });

  it("limits destructive account controls and bulk deletion to system.root", () => {
    const source = readFileSync(resolve(operatorRoot, "users.tsx"), "utf8");
    expect(source).toContain("canDelete && onBulkDelete");
    expect(source).toContain('value: "delete"');
    expect(source).toContain('apiFetch("/api/accounts", {');
    expect(source).toContain('method: "DELETE"');
    expect(source).toContain("JSON.stringify({ ids: [account.id] })");
    expect(source).not.toContain("/api/accounts/bulk");
  });

  it("runs bulk selection through the server-side workflow, not repeated browser API calls", () => {
    const files = [
      "users.tsx",
      "blog/index.tsx",
      "blog/categories.tsx",
      "catalogue/categories.tsx",
      "catalogue.tsx",
      "reviews.tsx",
    ] as const;

    for (const file of files) {
      const source = readFileSync(resolve(operatorRoot, file), "utf8");
      expect(source, file).toContain("runOperatorBulkAction");
      expect(source, file).not.toMatch(/\/api\/[^\s"'`]*\/bulk/);
    }
  });

  it("requests the authorized all-state withdrawal collection for operator tables", () => {
    const source = readFileSync(resolve(operatorRoot, "withdrawals.tsx"), "utf8");
    expect(source).toContain('params.set("state", filters.state || "all")');
    expect(source).toContain("`/internal/withdrawals?${params}`");
    expect(source).not.toContain("/api/operator/withdrawals");
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
