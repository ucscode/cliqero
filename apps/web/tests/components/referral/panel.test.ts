import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/components/referral/panel.tsx"), "utf8");

describe("referral panel loading boundaries", () => {
  it("keeps initial account loading separate from hierarchy rebasing", () => {
    expect(source).toContain('const [initialRootParam] = useState(() => params.get("root"))');
    expect(source).toContain("void loadPanel(initialRootParam)");
    expect(source).toContain("fetchHierarchyTree(rootId, apiFetch)");
    expect(source).toContain("setLoading: setHierarchyLoading");
    expect(source).not.toContain("router.push");
  });

  it("uses popstate for history traversal without reloading account panels", () => {
    expect(source).toContain('window.addEventListener("popstate", handlePopState)');
    expect(source).toContain("rebaseHierarchy(referralRootFromUrl(window.location.href), false)");
    expect(source).not.toContain(
      "setLoading(true)\n    setError(null)\n    try {\n      const nextTree",
    );
  });
});
