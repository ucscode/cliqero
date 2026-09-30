import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiKeyScopeList } from "@/components/operator/api-keys/scope-list";

describe("API-key permission checkbox list", () => {
  it("makes permitted scopes discoverable with labels, identifiers, descriptions and controlled checks", () => {
    const html = renderToStaticMarkup(
      <ApiKeyScopeList
        availableScopes={["catalogue:read", "catalogue:manage"]}
        selectedScopes={["catalogue:read"]}
        loading={false}
        accountSelected
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Catalogue reads");
    expect(html).toContain("catalogue:read");
    expect(html).toContain("Read catalogue data available to the account.");
    expect(html).toContain("Catalogue management");
    expect(html).not.toContain("wallet:read");
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).not.toContain("Search");
    expect(html).not.toContain("combobox");
  });

  it("waits for an account and its assignable-scope projection before listing permissions", () => {
    const html = renderToStaticMarkup(
      <ApiKeyScopeList
        availableScopes={[]}
        selectedScopes={[]}
        loading={false}
        accountSelected={false}
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Select an account to see assignable permissions.");
    expect(html).not.toContain('type="checkbox"');
  });
});
