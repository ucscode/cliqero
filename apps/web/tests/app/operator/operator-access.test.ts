import { describe, expect, it } from "vitest";
import { capabilityForPath } from "@/app/operator/operator-access";

describe("operator page capability routing", () => {
  it("requires account management only for Users create/edit routes", () => {
    expect(capabilityForPath("/operator/users/new")).toBe("accounts.manage");
    expect(capabilityForPath("/operator/users/123e4567-e89b-42d3-a456-426614174000/edit")).toBe(
      "accounts.manage",
    );
    expect(capabilityForPath("/operator/users")).toBe("accounts.read");
    expect(capabilityForPath("/operator/users/123e4567-e89b-42d3-a456-426614174000")).toBe(
      "accounts.read",
    );
  });

  it("does not misclassify unrelated operator edit paths as account management", () => {
    expect(capabilityForPath("/operator/treasury/example/edit")).toBe("treasury.manage");
    expect(capabilityForPath("/operator/withdrawals/example/edit")).toBe("withdrawals.manage");
  });
});
