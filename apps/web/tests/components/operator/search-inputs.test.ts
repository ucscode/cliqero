import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), `src/components/${path}`), "utf8");
}

describe("native search input contracts", () => {
  it.each([
    ["operator/users.tsx", 'id="operator-user-search"'],
    ["operator/catalogue.tsx", 'id="catalogue-search"'],
    ["operator/blog/index.tsx", 'id="blog-search"'],
    ["operator/treasury.tsx", 'id="treasury-search"'],
    ["operator/funding.tsx", 'id="funding-search"'],
    ["operator/funding.tsx", 'id="funding-provider"'],
    ["operator/distributions.tsx", 'id="distribution-search"'],
    ["operator/withdrawals.tsx", 'id="withdrawal-search"'],
    ["operator/earnings.tsx", 'id="earnings-search"'],
    ["operator/network.tsx", 'id="operator-network-search"'],
    ["storefront/catalogue.tsx", 'id="catalogue-search"'],
    ["hierarchy/panel.tsx", 'id="hierarchy-search"'],
  ])("uses type=search for %s %s", (path, id) => {
    const component = source(path);
    const field = component.slice(
      component.indexOf(id),
      component.indexOf("/>", component.indexOf(id)),
    );
    expect(field).toContain('type="search"');
  });

  it("keeps controlled search drafts and submits through their existing forms", () => {
    const users = source("operator/users.tsx");
    const catalogue = source("operator/catalogue.tsx");
    const storefront = source("storefront/catalogue.tsx");

    expect(users).toContain("onChange={(event) => onSearchChange(event.target.value)}");
    expect(users).toContain("onFiltersSubmit={onSearch}");
    expect(catalogue).toContain("onChange={(event) => setSearch(event.target.value)}");
    expect(catalogue).toContain("onFiltersSubmit={async (event) => {");
    expect(storefront).toContain("onChange={(event) => setDraft(event.target.value)}");
    expect(storefront).toContain("onSubmit={(event) => {");
    expect(storefront).toContain(
      "navigate({ q: draft.trim() || null, cursor: null, trail: null })",
    );
  });
});
