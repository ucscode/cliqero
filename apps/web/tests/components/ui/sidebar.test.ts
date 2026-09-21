import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sidebarSource = readFileSync(
  resolve(__dirname, "../../../src/components/ui/sidebar.tsx"),
  "utf8",
);

describe("sidebar scroll structure", () => {
  it("constrains the desktop sidebar to the viewport", () => {
    expect(sidebarSource).toMatch(/sticky top-0 hidden h-dvh[^\"]*overflow-hidden/);
  });

  it("keeps the sidebar shell and fixed regions out of the scroll container", () => {
    expect(sidebarSource).toContain('className="flex h-full min-h-0 flex-col gap-8"');
    expect(sidebarSource).toContain('cn("shrink-0 p-6 pb-0", className)');
    expect(sidebarSource).toContain('cn("shrink-0 p-6 pt-0", className)');
    expect(sidebarSource).toContain('cn("min-h-0 flex-1 overflow-y-auto px-4", className)');
  });

  it("applies the same constrained shell to the mobile sheet", () => {
    expect(sidebarSource).toContain("h-dvh min-h-0 w-[min(82vw,280px)] overflow-hidden");
  });
});
