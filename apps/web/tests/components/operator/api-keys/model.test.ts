import { describe, expect, it, vi } from "vitest";
import {
  apiKeyCollectionQuery,
  apiKeyFiltersEqual,
  INITIAL_API_KEY_FILTERS,
  operatorApiKeyRowActions,
  toggleApiKeyScope,
  type OperatorApiKeyRow,
} from "@/components/operator/api-keys/model";

const row = (state: OperatorApiKeyRow["state"]): OperatorApiKeyRow => ({
  id: "key-1",
  name: "Example",
  scopes: [],
  account_id: "account-1",
  account_username: "alpha",
  account_email: null,
  state,
  created_at: "2026-01-01T00:00:00.000Z",
  last_used_at: null,
  expires_at: null,
  revoked_at: state === "deleted" ? "2026-01-02T00:00:00.000Z" : null,
});

describe("Operator API-key collection and row behavior", () => {
  it("builds request filters only from the supplied applied state and carries its page cursor", () => {
    const query = apiKeyCollectionQuery(
      {
        search: "  automation  ",
        accountId: "account-1",
        state: "expired",
        sort: "name",
        direction: "asc",
      },
      "25",
      25,
    );
    expect(query.toString()).toBe(
      "limit=25&state=expired&sort=name&direction=asc&search=automation&account_id=account-1&cursor=25",
    );
  });

  it("uses stable initial filters and compares draft state without fetching", () => {
    expect(INITIAL_API_KEY_FILTERS).toEqual({
      search: "",
      accountId: null,
      state: "all",
      sort: "created",
      direction: "desc",
    });
    expect(apiKeyFiltersEqual(INITIAL_API_KEY_FILTERS, { ...INITIAL_API_KEY_FILTERS })).toBe(true);
    expect(
      apiKeyFiltersEqual(INITIAL_API_KEY_FILTERS, { ...INITIAL_API_KEY_FILTERS, search: "draft" }),
    ).toBe(false);
  });

  it.each(["active", "expired"] as const)(
    "offers Edit API key and Delete API key for %s keys",
    (state) => {
      const onDelete = vi.fn();
      const actions = operatorApiKeyRowActions(row(state), onDelete);
      expect(actions.map((action) => action.label)).toEqual(["Edit API key", "Delete API key"]);
      expect(actions[0]).toMatchObject({ type: "link", href: "/operator/api-keys/key-1" });
      expect(actions[1]).toMatchObject({ type: "action", destructive: true });
      if (actions[1].type === "action") actions[1].onSelect();
      expect(onDelete).toHaveBeenCalledWith(row(state));
    },
  );

  it("offers no invalid action for deleted keys", () => {
    expect(operatorApiKeyRowActions(row("deleted"), vi.fn())).toEqual([]);
  });

  it("adds and removes controlled scope values without losing other selections", () => {
    const both = toggleApiKeyScope(["catalogue:read"], "wallet:read", true);
    expect(both).toEqual(["catalogue:read", "wallet:read"]);
    expect(toggleApiKeyScope(both, "catalogue:read", false)).toEqual(["wallet:read"]);
  });
});
