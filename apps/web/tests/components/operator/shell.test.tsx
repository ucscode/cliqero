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
        username="root_user"
        email="root_user@example.test"
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

  it("shares Catalogue, Finance, and Blog groups and hides groups without visible children", () => {
    const html = renderToStaticMarkup(
      <OperatorShell
        capabilities={["catalogue.manage", "reviews.moderate", "finance.read", "content.manage"]}
        username="operator"
        email="operator@example.test"
        activeSection="blogCategories"
      >
        <main>Categories</main>
      </OperatorShell>,
    );
    expect(html).toContain("Catalogue");
    expect(html).toContain("Finance");
    expect(html).toContain("Blog");
    expect(html).not.toContain("/operator/catalogue");
    expect(html).toContain("/operator/blog/categories");
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain("<details");
    expect(html).not.toContain("/operator/treasury");

    const noCatalogue = renderToStaticMarkup(
      <OperatorShell
        capabilities={["finance.read"]}
        username="operator"
        email="operator@example.test"
        activeSection="users"
      >
        <main>Users</main>
      </OperatorShell>,
    );
    expect(noCatalogue).not.toContain("Catalogue");
    expect(noCatalogue).not.toContain("Blog");
  });

  it("places Reviews inside the Catalogue group and not as a top-level route", () => {
    const html = renderToStaticMarkup(
      <OperatorShell
        capabilities={["catalogue.manage", "reviews.moderate"]}
        username="operator"
        email="operator@example.test"
        activeSection="reviews"
      >
        <main>Reviews page</main>
      </OperatorShell>,
    );
    const catalogueIndex = html.indexOf("Catalogue");
    const reviewsIndex = html.indexOf("Reviews</a>");
    expect(catalogueIndex).toBeGreaterThanOrEqual(0);
    expect(reviewsIndex).toBeGreaterThan(catalogueIndex);
    expect(html).toContain('aria-expanded="true"');
  });
});
