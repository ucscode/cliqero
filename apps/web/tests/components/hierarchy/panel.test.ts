import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/components/hierarchy/panel.tsx"), "utf8");

describe("hierarchy panel composition", () => {
  it("keeps the graphical hierarchy flow and history behavior together", () => {
    expect(source).toContain("<HierarchyGraph");
    expect(source).toContain("fetchHierarchyTree(rootId, apiFetch)");
    expect(source).toContain('window.addEventListener("popstate", handlePopState)');
    expect(source).toContain("setLoading: setHierarchyLoading");
    expect(source).not.toContain("Direct referrals");
    expect(source).not.toContain("Upline context");
    expect(source).not.toContain("Network context");
  });

  it("uses customer network language without changing hierarchy internals", () => {
    expect(source).toContain("Your referral network");
    expect(source).toContain("Explore people in your referral network.");
    expect(source).toContain("fetchHierarchyTree(rootId, apiFetch)");
    expect(source).not.toContain("authorized account hierarchy");
    expect(source).not.toContain("Your referral hierarchy");
  });

  it("keeps hierarchy rebasing independent from the full panel load", () => {
    expect(source).toContain('const [initialRootParam] = useState(() => params.get("root"))');
    expect(source).toContain("void loadPanel(initialRootParam)");
    expect(source).toContain("rebaseHierarchy(hierarchyRootFromUrl(window.location.href), false)");
    expect(source).not.toContain("router.push");
  });
});
