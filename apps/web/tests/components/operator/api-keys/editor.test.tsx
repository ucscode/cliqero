import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiKeyScopeList } from "@/components/operator/api-keys/scope-list";

describe("Operator API-key create and edit pages", () => {
  it("uses dedicated Next page routes for creation and editing", () => {
    expect(existsSync(resolve(process.cwd(), "src/app/operator/api-keys/new/page.tsx"))).toBe(true);
    expect(
      existsSync(resolve(process.cwd(), "src/app/operator/api-keys/[apiKeyId]/page.tsx")),
    ).toBe(true);
    const createPage = readFileSync(
      resolve(process.cwd(), "src/app/operator/api-keys/new/page.tsx"),
      "utf8",
    );
    const editPage = readFileSync(
      resolve(process.cwd(), "src/app/operator/api-keys/[apiKeyId]/page.tsx"),
      "utf8",
    );
    expect(createPage).toContain('<OperatorApiKeyEditor mode="create" />');
    expect(editPage).toContain(
      'canReassignOwner={hasCapability(access.capabilities, "system.root")}',
    );
  });

  it("uses shared edit composition, root-only ownership transfer, status controls, and one-time replacement", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/operator/api-keys/editor.tsx"),
      "utf8",
    );
    expect(source).toContain("<CrudEdit");
    expect(source).toContain('backLabel="Back to API keys"');
    expect(source).toContain("<ApiKeyScopeList");
    expect(source).toContain(
      "item.scopes.filter((scope) => scopeResult.manageable_scopes.includes(scope))",
    );
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain("Editing does not change the credential.");
    expect(source).toContain("canReassignOwner");
    expect(source).toContain("value={status}");
    expect(source).toContain("/reassign");
    expect(source).toContain('setCredentialAction("reassigned")');
    expect(source).not.toContain("MultiSelect");
    expect(source).toContain('useState<"active" | "revoked">("active")');
    expect(source).toContain("state: payload.state");
    expect(source).toContain("account.id !== originalAccountId");
    expect(source).toContain('mode === "create" ? "New API key" : "Edit API key"');
    const positions = [
      source.indexOf('Label htmlFor="api-key-account"'),
      source.indexOf('Label htmlFor="api-key-name"'),
      source.indexOf('Label htmlFor="api-key-state"'),
      source.indexOf("<ApiKeyScopeList"),
      source.indexOf('Label htmlFor="api-key-expiry"'),
    ];
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("keeps the one-time secret inline until Done navigates back, never in a URL or toast", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/operator/api-keys/editor.tsx"),
      "utf8",
    );
    expect(source).toContain("setSecret(created.secret)");
    expect(source).toContain("setSecret(replacement.secret)");
    expect(source).toContain('data-testid="api-key-secret"');
    expect(source).toContain("navigator.clipboard.writeText(secret)");
    expect(source).toContain('toast.success("API key created.")');
    expect(source).toContain("onClick={() => router.push(COLLECTION)}");
    expect(source).not.toMatch(/toast\.(?:success|info|error)\([^\n]*secret/i);
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });

  it("renders scope choices as checkboxes with no permission search control", () => {
    const html = renderToStaticMarkup(
      <ApiKeyScopeList
        availableScopes={["catalogue:read"]}
        selectedScopes={[]}
        loading={false}
        accountSelected
        onChange={() => {}}
      />,
    );
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("Catalogue reads");
    expect(html).not.toContain('type="search"');
    expect(html).not.toContain("combobox");
  });

  it("shows the full permission matrix disabled before selecting an account", () => {
    const html = renderToStaticMarkup(
      <ApiKeyScopeList
        availableScopes={[]}
        selectedScopes={[]}
        loading={false}
        accountSelected={false}
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Permissions");
    expect(html).toContain("Select an account to check which of these permissions it may receive.");
    expect(html).toContain("Catalogue reads");
    expect(html).toContain("treasury:read");
    expect([...html.matchAll(/<input type="checkbox" disabled=""/g)]).toHaveLength(27);
  });

  it("renders Create in Account, Name, Status, Permissions, Expiry order", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/operator/api-keys/editor.tsx"),
      "utf8",
    );
    const positions = [
      source.indexOf('Label htmlFor="api-key-account"'),
      source.indexOf('Label htmlFor="api-key-name"'),
      source.indexOf('Label htmlFor="api-key-state"'),
      source.indexOf("<ApiKeyScopeList"),
      source.indexOf('Label htmlFor="api-key-expiry"'),
    ];
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(source).toContain("state: payload.state");
    expect(source).toContain(
      "setScopes((current) => current.filter((scope) => result.manageable_scopes.includes(scope)))",
    );
  });
});
