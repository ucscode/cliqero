import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OperatorShell } from "@/components/operator/shell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

describe("operator shell", () => {
  it("keeps navigation and account controls without repeating a route title", () => {
    const html = renderToStaticMarkup(
      <OperatorShell
        capabilities={[]}
        username="tree_root"
        email="tree_root@example.test"
        activeSection="users"
      >
        <main>Users page</main>
      </OperatorShell>,
    );

    expect(html).not.toContain("Operational view");
    expect(html).not.toContain(">Users</h1>");
    expect(html).toContain('aria-label="Open operator navigation"');
    expect(html).toContain('aria-label="Open operator account menu"');
    expect(html).toContain("Users page");
    expect(html).toContain("sticky top-0");
    expect(html).toContain("h-14");
    expect(html).toContain("ml-auto");
  });

  it("groups Finance and Blog navigation and opens the active child group", () => {
    const html = renderToStaticMarkup(
      <OperatorShell
        capabilities={["finance.read", "content.manage"]}
        username="operator"
        email="operator@example.test"
        activeSection="blogCategories"
      >
        <main>Categories</main>
      </OperatorShell>,
    );
    expect(html).toContain(">Finance</summary>");
    expect(html).toContain(">Blog</summary>");
    expect(html).toContain("/operator/blog/categories");
    expect(html).toMatch(/<details open="" class="group\/operator-nav">.*?Blog/s);
    expect(html).not.toContain("/operator/treasury");
  });
});
