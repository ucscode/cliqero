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

  it("submits a manual username form and integrates exact matches with root navigation", () => {
    expect(source).toContain(
      '<form className="grid gap-2 sm:max-w-md" onSubmit={submitUsernameSearch}>',
    );
    expect(source).toContain('placeholder="Search your network by username"');
    expect(source).toContain('type="submit"');
    expect(source).toContain('setSearchQuery("")');
    expect(source).toContain("rebaseHierarchy(match.id, true)");
    expect(source).toContain("Viewing tree from:");
    expect(source).toContain("Back to my network");
    expect(source).toContain("onResetRoot={resetRoot}");
    expect(source).toContain("runHierarchyRebase(() => fetchHierarchyTree(rootId, apiFetch)");
    expect(source).toContain("onError: (cause) => {");
  });

  it("has no autocomplete or request-on-input behavior and announces outcomes accessibly", () => {
    expect(source).not.toContain("HierarchySearchController");
    expect(source).not.toContain('role="combobox"');
    expect(source).not.toContain('role="listbox"');
    expect(source).not.toContain('role="option"');
    expect(source).not.toContain("setTimeout");
    expect(source).not.toContain("searchClientRef.current!.find(event.target.value)");
    expect(source).toContain('role="status" aria-live="polite"');
    expect(source).toContain("User not found in your network.");
    expect(source).toContain("We couldn’t search your network. Please try again.");
    expect(source).toContain("Enter a username to search.");
  });
});
