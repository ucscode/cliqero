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
  });
});
