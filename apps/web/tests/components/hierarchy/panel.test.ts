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

  it("integrates username search with the existing root navigation and preserves the graph", () => {
    expect(source).toContain('placeholder="Search your network by username"');
    expect(source).toContain("HierarchySearchController");
    expect(source).toContain("selectSearchResult(item.id)");
    expect(source).toContain("setSearchOpen(false);");
    expect(source).toContain('setSearchQuery("")');
    expect(source).toContain("openRoot(id)");
    expect(source).toContain("Viewing tree from:");
    expect(source).toContain("Back to my network");
    expect(source).toContain("onResetRoot={resetRoot}");
    expect(source).toContain("runHierarchyRebase(() => fetchHierarchyTree(rootId, apiFetch)");
    expect(source).toContain("onError: (cause) => {");
  });

  it("keeps search results private and accessible without displaying email", () => {
    expect(source).toContain(
      'className="text-sm font-medium text-slate-900">{item.username}</span>',
    );
    expect(source).toContain("{item.displayName}");
    expect(source).not.toContain("item.email");
    expect(source).toContain('event.key === "ArrowDown"');
    expect(source).toContain('event.key === "ArrowUp"');
    expect(source).toContain('event.key === "Enter"');
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain('document.addEventListener("pointerdown", closeOnOutsidePointer)');
    expect(source).toContain("No user found in your network");
  });
});
