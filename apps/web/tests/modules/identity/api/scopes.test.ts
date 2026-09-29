import { describe, expect, it } from "vitest";
import { grantableScopes } from "@/api/shared/context";
import { OPERATOR_SCOPE_CAPABILITIES, apiScopeSchema } from "@/modules/identity/api/scopes";

describe("account management API scope", () => {
  it("is a distinct operator scope requiring accounts.manage", () => {
    expect(apiScopeSchema.parse("accounts:manage")).toBe("accounts:manage");
    expect(OPERATOR_SCOPE_CAPABILITIES["accounts:manage"]).toEqual(["accounts.manage"]);
    expect(grantableScopes({ capabilities: ["accounts.read"] } as never)).not.toContain(
      "accounts:manage",
    );
    expect(grantableScopes({ capabilities: ["accounts.manage"] } as never)).toContain(
      "accounts:manage",
    );
  });
});

describe("payment operator API scopes", () => {
  it("separates payment inspection from reconciliation authority", () => {
    expect(OPERATOR_SCOPE_CAPABILITIES["payments:read"]).toEqual(["finance.read"]);
    expect(OPERATOR_SCOPE_CAPABILITIES["payments:manage"]).toEqual(["finance.manage"]);
    expect(grantableScopes({ capabilities: ["finance.read"] } as never)).toContain("payments:read");
    expect(grantableScopes({ capabilities: ["finance.read"] } as never)).not.toContain(
      "payments:manage",
    );
    expect(grantableScopes({ capabilities: ["finance.manage"] } as never)).toContain(
      "payments:manage",
    );
  });
});
