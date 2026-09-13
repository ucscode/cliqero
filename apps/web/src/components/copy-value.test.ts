import { describe, expect, it } from "vitest";
import { copyValueActionLabel, copyValueButtonLabel } from "./copy-value";

describe("copy value control", () => {
  it("uses one concise feedback label", () => {
    expect(copyValueButtonLabel(false)).toBe("Copy");
    expect(copyValueButtonLabel(true)).toBe("Copied");
  });

  it("keeps the action label suitable for an icon button", () => {
    expect(copyValueActionLabel("transfer amount", false)).toBe("Copy transfer amount");
    expect(copyValueActionLabel("transfer amount", true)).toBe("transfer amount copied");
  });
});
