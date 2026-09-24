import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const form = readFileSync(
  resolve(process.cwd(), "src/components/withdrawal/payout-methods/form.tsx"),
  "utf8",
);
const page = readFileSync(
  resolve(process.cwd(), "src/components/withdrawal/payout-methods/form-page.tsx"),
  "utf8",
);

describe("Payout Methods form pages", () => {
  it("does not preselect a method and gates details and save behind an explicit choice", () => {
    expect(form).toContain('useState(destination?.method.id ?? "")');
    expect(form).not.toContain("methods[0]");
    expect(form).toContain('<Label htmlFor="payout-method-type">Type</Label>');
    expect(form).toContain("Choose a payout type");
    expect(form).toContain("{method && (");
    expect(form).toContain('"Save payout method"');
    expect(form).toContain('field.type === "fixed"');
    expect(form).toContain('field.type === "select"');
    expect(form).toContain('field.type === "textarea"');
    expect(form).toContain('field.type === "hidden"');
    expect(form).toContain("field.description");
    expect(form).toContain("border-t border-slate-200");
    expect(form).toContain("bg-slate-50 p-4");
    expect(form).toContain("{method && (");
    expect(form).toContain('.filter((field) => field.type !== "fixed" && field.type !== "hidden")');
  });

  it("reuses one form for add and edit, with immutable method on edit and persisted API calls", () => {
    expect(page).toContain("<PayoutMethodForm");
    expect(page).toContain('method: "POST"');
    expect(page).toContain('method: "PATCH"');
    expect(page).toContain("JSON.stringify({ name: input.name, values: input.values })");
    expect(page).toContain("JSON.stringify({");
    expect(form).toContain("destination.method.display_name");
    expect(form).toContain("destination ? (");
  });

  it("wires dedicated create and dynamic edit routes into the existing dashboard shell", () => {
    const createRoute = readFileSync(
      resolve(process.cwd(), "src/app/dashboard/payout-methods/new/page.tsx"),
      "utf8",
    );
    const editRoute = readFileSync(
      resolve(process.cwd(), "src/app/dashboard/payout-methods/[destinationId]/edit/page.tsx"),
      "utf8",
    );
    const shell = readFileSync(
      resolve(process.cwd(), "src/components/dashboard/shell.tsx"),
      "utf8",
    );

    expect(createRoute).toContain('payoutMethodFormMode="create"');
    expect(editRoute).toContain('payoutMethodFormMode="edit"');
    expect(editRoute).toContain("params: Promise<{ destinationId: string }>");
    expect(shell).toContain("<PayoutMethodFormPage");
    expect(page).toContain('const payoutMethodsHref = "/dashboard?section=payout-methods"');
    expect(shell).toContain('"Add payout method"');
    expect(shell).toContain('"Edit payout method"');
    expect(page).not.toContain("<h2");
    expect(page).toContain("Back to Payout Methods");
  });
});
