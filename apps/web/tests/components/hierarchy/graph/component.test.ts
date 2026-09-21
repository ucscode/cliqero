import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/components/hierarchy/graph/index.tsx"),
  "utf8",
);

describe("hierarchy graph interaction contract", () => {
  it("uses accessible node surfaces and keeps secondary actions separate", () => {
    expect(source).toContain('type="button"');
    expect(source).toContain("data.onViewBranch(navigationTarget)");
    expect(source).toContain("primaryContent");
    expect(source).toContain("aria-label={`Explore ${accessibleLabel}`}");
    expect(source).toContain("event.stopPropagation()");
    expect(source).not.toContain("View branch");
  });

  it("disables customer dragging while retaining operator-mode separation", () => {
    expect(source).toContain("nodesDraggable={operatorMode}");
    expect(source).not.toContain("Dragging is visual only");
  });

  it("does not render the removed graph-level parent banner or action", () => {
    expect(source).not.toContain("Parent context");
    expect(source).not.toContain("Navigation stops at your account.");
    expect(source).not.toContain("onNavigateParent");
  });
});
