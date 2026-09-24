import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/components/withdrawal/purse/destination-dialog.tsx"),
  "utf8",
);

describe("purse destination dialog UI contract", () => {
  it("uses the same modal for add and edit while keeping a saved method immutable", () => {
    expect(source).toContain("<Dialog open={open}");
    expect(source).toContain('"Add destination"');
    expect(source).toContain('"Edit destination"');
    expect(source).toContain("!destination");
    expect(source).toContain("destination ?");
    expect(source).toContain('"/api/withdrawal-destinations"');
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain("JSON.stringify({ name, values })");
    expect(source).toContain("JSON.stringify({ method: method.id, name, values })");
  });

  it("renders the finalized dynamic method field vocabulary", () => {
    expect(source).toContain('field.type === "fixed"');
    expect(source).toContain('field.type === "select"');
    expect(source).toContain('field.type === "textarea"');
    expect(source).toContain("field.regex");
    expect(source).toContain("field.enum");
    expect(source).toContain("field.attrs");
    expect(source).toContain("option.key");
    expect(source).toContain("option.label");
    expect(source).toContain("field.name");
    expect(source).not.toContain("allowed_values");
    expect(source).not.toContain("field.config");
    expect(source).not.toContain("input_mode");
    expect(source).not.toContain("field.pattern");
    expect(source).not.toContain("field.key");
  });
});
