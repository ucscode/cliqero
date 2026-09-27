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
