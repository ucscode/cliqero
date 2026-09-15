import { describe, expect, it } from "vitest";
import { AuthenticationService } from "@/application/identity/authentication";
import type { AuthenticationGateway } from "@/application/identity/contracts";
import { Account } from "@/modules/identity/account";
import { DuplicateUsernameError, type IdentityPersistence } from "@/modules/identity/persistence";

function dependencies() {
  const accounts: Account[] = [];
  const removedAuthUsers: string[] = [];
  const identity: IdentityPersistence = {
    removeUnlinkedAuthUser: async () => undefined,
    createAccount: async (account) => {
      if (accounts.some((value) => value.username === account.username))
        throw new DuplicateUsernameError();
      accounts.push(account);
    },
    linkCompletedAuthAccount: async () => true,
    removeAuthUser: async (id) => void removedAuthUsers.push(id),
    accountForAuthUser: async () => accounts[0] ?? null,
    authUserEmail: async () => "buyer@example.com",
  };
  const gateway: AuthenticationGateway = {
    signUpEmail: async () => ({ user: { id: "auth-user" }, token: "session-token" }),
    signInEmail: async () => ({ user: { id: "auth-user" }, token: "session-token" }),
    getSession: async () => null,
    resetPassword: async () => undefined,
    hasPasswordCredential: async () => true,
    setPassword: async () => "credential",
    removePasswordCredential: async () => undefined,
    close: async () => undefined,
  };
  const service = new AuthenticationService(identity, gateway, {
    transaction: async (operation) => operation(),
  });
  return { accounts, removedAuthUsers, service };
}

describe("AuthenticationService application contracts", () => {
  it("orchestrates registration through persistence and authentication contracts", async () => {
    const { accounts, service } = dependencies();
    const account = await service.register({
      email: " Buyer@Example.com ",
      username: "Buyer_1",
      password: "correct-horse-battery",
      country: "ng",
    });

    expect(account.username).toBe("buyer_1");
    expect(account.country).toBe("NG");
    expect(accounts).toHaveLength(1);
  });

  it("translates persistence duplicate errors without exposing database details", async () => {
    const first = dependencies();
    await first.service.register({
      email: "first@example.com",
      username: "same_name",
      password: "correct-horse-battery",
      country: "NG",
    });

    await expect(
      first.service.register({
        email: "second@example.com",
        username: "same_name",
        password: "correct-horse-battery",
        country: "NG",
      }),
    ).rejects.toMatchObject({ code: "username_taken", status: 409 });
  });
});
