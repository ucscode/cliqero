import { describe, expect, it } from "vitest";
import { formatMinorUsd } from "@/lib/api-client";
import * as compatibilityUi from "./ui";

describe("Money formatting", () => {
  it("keeps canonical integer minor units exact", () => {
    expect(formatMinorUsd("1")).toBe("$0.01");
    expect(formatMinorUsd("100")).toBe("$1.00");
    expect(formatMinorUsd("1000")).toBe("$10.00");
  });

  it("is not exported from the generic compatibility barrel", () => {
    expect("Money" in compatibilityUi).toBe(false);
  });
});
