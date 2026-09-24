import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/components/withdrawal/methods.tsx"),
  "utf8",
);

describe("saved withdrawal methods UI contract", () => {
  it("supports destination listing, add/edit and archive via PATCH resource updates", () => {
    expect(source).toContain('"/api/withdrawal-destinations"');
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain('status: "archived"');
    expect(source).toContain("beginEdit(destination)");
    expect(source).toContain("Unavailable for new withdrawals");
  });

  it("renders configured editable fields and fixed fields without submitting trusted values", () => {
    expect(source).toContain('field.type === "fixed"');
    expect(source).toContain("field.pattern");
    expect(source).toContain("field.input_mode");
    expect(source).toContain("JSON.stringify({ method: method.id, name, values })");
    expect(source).not.toContain("values[field.key] = field.value");
  });
});
