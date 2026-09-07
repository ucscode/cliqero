import { describe, expect, it } from "vitest";
import { Account } from "./account";
import { usernameSchema } from "./username";

describe("Cliqero account username", () => {
  it("normalizes usernames at the domain boundary", () => {
    expect(new Account("account-1", "user@example.com", "  Example_User  ").username).toBe(
      "example_user",
    );
  });

  it("rejects usernames with spaces or unsupported characters", () => {
    expect(() => new Account("account-1", "user@example.com", "not valid")).toThrow(
      "Account username is invalid",
    );
    expect(() => new Account("account-1", "user@example.com", "ab")).toThrow(
      "Account username is invalid",
    );
  });

  it("normalizes username API input before applying the canonical policy", () => {
    expect(usernameSchema.parse("  Example_User ")).toBe("example_user");
  });
});
