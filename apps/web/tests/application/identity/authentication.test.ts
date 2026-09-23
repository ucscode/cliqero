import { describe, expect, it } from "vitest";
import { AuthenticationService } from "@/application/identity/authentication";
import type { AuthenticationGateway } from "@/application/identity/contracts";
import { Account } from "@/modules/identity/account";
import {
  DuplicateUsernameError,
  type AuthAccountLinkState,
  type IdentityPersistence,
} from "@/modules/identity/persistence";

function dependencies(
  options: {
    linkState?: AuthAccountLinkState;
    session?: { user: { id: string }; token?: string | null } | null;
  } = {},
) {
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
    authAccountLinkState: async () => options.linkState ?? "complete",
    accountForAuthUser: async () => accounts[0] ?? null,
    authUserEmail: async () => "buyer@example.com",
  };
  const gateway: AuthenticationGateway = {
    signUpEmail: async () => ({ user: { id: "auth-user" }, token: "session-token" }),
    signInEmail: async () => ({ user: { id: "auth-user" }, token: "session-token" }),
    getSession: async () => options.session ?? null,
    resetPassword: async () => undefined,
    hasPasswordCredential: async () => true,
    setPassword: async () => "credential",
    removePasswordCredential: async () => undefined,
    close: async () => undefined,
  };
  const service = new AuthenticationService(identity, gateway, {
    transaction: async (operation) => operation(),
  });
  return { accounts, removedAuthUsers, identity, gateway, service };
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

  it("claims a valid account referral inside new-account creation", async () => {
    const first = dependencies();
    const calls: string[] = [];
    const service = new AuthenticationService(
      first.identity,
      first.gateway,
      { transaction: async (operation) => operation() },
      {
        resolve: async () => null,
        claim: async (source, childAccountId) => {
          calls.push(`${source}:${childAccountId}`);
          return { referrerAccountId: "550e8400-e29b-41d4-a716-446655440000" };
        },
        visit: async () => null,
        urlFor: async () => "https://example.test/r/referrer",
      },
      {
        establish: async (child, parent) => {
          calls.push(`${child}->${parent}`);
        },
      },
    );

    const account = await service.register({
      email: "referred@example.com",
      username: "referred",
      password: "correct-horse-battery",
      country: "NG",
      accountReferralSource: "opaque-token",
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBe(`opaque-token:${account.id}`);
    expect(calls[1]).toBe(`${account.id}->550e8400-e29b-41d4-a716-446655440000`);
  });

  it.each([
    ["incomplete", null],
    ["complete", "buyer"],
    ["missing", null],
  ] as const)(
    "preserves the %s auth-link state on the application principal",
    (linkState, username) => {
      const { accounts, service } = dependencies({
        linkState,
        session: { user: { id: "auth-user" } },
      });
      if (username) accounts.push(new Account("550e8400-e29b-41d4-a716-446655440000", username));
      return expect(service.principal(new Request("http://localhost"))).resolves.toMatchObject({
        authUserId: "auth-user",
        authLinkState: linkState,
        account: username ? { username } : null,
      });
    },
  );
});
