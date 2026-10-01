import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiKeyScopeList } from "@/components/operator/api-keys/scope-list";

describe("API-key permission checkbox list", () => {
  it("shows the full permission matrix and enables only scopes allowed for the selected account", () => {
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
    expect(html).toContain("wallet:read");
    expect(html).toContain("wallet:transfer");
    expect(html).toContain("reviews:moderate");
    expect(html.match(/type="checkbox"/g)).toHaveLength(27);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html.match(/disabled=""/g)).toHaveLength(25);
    expect(html).toContain("Unavailable for selected account.");
    expect(html).not.toContain("Search");
    expect(html).not.toContain("combobox");
  });

  it("shows all scopes before account selection but keeps them disabled for validation", () => {
    const html = renderToStaticMarkup(
      <ApiKeyScopeList
        availableScopes={[]}
        selectedScopes={[]}
        loading={false}
        accountSelected={false}
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Select an account to check which of these permissions it may receive.");
    expect(html).toContain("catalogue:manage");
    expect(html.match(/type="checkbox"/g)).toHaveLength(27);
    expect(html.match(/disabled=""/g)).toHaveLength(27);
  });
});
