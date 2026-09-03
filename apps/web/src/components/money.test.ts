import { describe, expect, it } from "vitest";
import { formatMinorUsd } from "@/lib/api-client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Money formatting", () => {
  it("keeps canonical integer minor units exact", () => {
    expect(formatMinorUsd("1")).toBe("$0.01");
    expect(formatMinorUsd("100")).toBe("$1.00");
    expect(formatMinorUsd("1000")).toBe("$10.00");
  });

  it("has no generic UI barrel module", () => {
    expect(() => readFileSync(resolve(__dirname, "ui.tsx"))).toThrow();
  });
});
