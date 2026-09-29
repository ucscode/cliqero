import { describe, expect, it } from "vitest";
import { crudMaxRows } from "@/config/crud";

describe("CRUD row limits", () => {
  it("uses the site-wide configured max_rows by default", () => {
    expect(crudMaxRows()).toBe(50);
  });

  it("allows a validated resource-specific maxRows override", () => {
    expect(crudMaxRows(25)).toBe(25);
  });

  it.each([0, -1, 1.5, 201])("rejects invalid maxRows override %s", (maxRows) => {
    expect(() => crudMaxRows(maxRows)).toThrow("between 1 and 200");
  });
});
