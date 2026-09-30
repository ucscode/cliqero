import { describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "@/application/identity/authentication";
import type { AuthenticationGateway } from "@/application/identity/contracts";
import { Account } from "@/modules/identity/account";
import {
  DuplicateUsernameError,
  type AuthIdentityResolution,
  type IdentityPersistence,
} from "@/modules/identity/persistence";

function dependencies(
  options: {
    identity?: AuthIdentityResolution;
    session?: { user: { id: string }; token?: string | null } | null;
  } = {},
) {
  const accounts: Account[] = [];
  const removedAuthUsers: string[] = [];
  const resolveAuthIdentity = vi.fn(
    async () =>
      options.identity ?? {
        state: "complete" as const,
        account: accounts[0] ?? new Account("550e8400-e29b-41d4-a716-446655440000", "buyer"),
      },
  );
  const identity: IdentityPersistence = {
    removeUnlinkedAuthUser: async () => undefined,
    createAccount: async (account) => {
      if (accounts.some((value) => value.username === account.username))
        throw new DuplicateUsernameError();
      accounts.push(account);
    },
    linkCompletedAuthAccount: async () => true,
    removeAuthUser: async (id) => void removedAuthUsers.push(id),
    removeAccountAuthIdentity: async () => undefined,
    resolveAuthIdentity,
    authUserEmail: async () => "buyer@example.com",
  };
  const gateway: AuthenticationGateway = {
    signUpEmail: async () => ({ user: { id: "auth-user" }, token: "session-token" }),
    createUserWithoutPassword: async () => ({ id: "auth-user" }),
    signInEmail: async () => ({ user: { id: "auth-user" }, token: "session-token" }),
    requestPasswordReset: async () => undefined,
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
  return { accounts, removedAuthUsers, identity, gateway, resolveAuthIdentity, service };
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

  it("supports operator provisioning without public country/password requirements and requests reset through the gateway", async () => {
    const { accounts, service, gateway } = dependencies();
    const reset = vi.spyOn(gateway, "requestPasswordReset");
    const account = await service.registerForOperator(
      {
        email: " New@Example.Test ",
        username: "new_user",
        password: "generated-random-bootstrap-credential",
      },
      "actor-id",
    );
    await service.requestPasswordSetup(" New@Example.Test ", "https://example.test/reset-password");

    expect(account.country).toBeNull();
    expect(accounts).toHaveLength(1);
    expect(reset).toHaveBeenCalledWith({
      email: "new@example.test",
      redirectTo: "https://example.test/reset-password",
    });
  });

  it("creates a Better Auth identity without a credential for operator email setup", async () => {
    const { accounts, service, gateway } = dependencies();
    const createWithoutPassword = vi.spyOn(gateway, "createUserWithoutPassword");
    const signUp = vi.spyOn(gateway, "signUpEmail");
    const account = await service.registerForOperatorWithoutPassword(
      { email: " New@Example.Test ", username: "new_user" },
      "actor-id",
    );

    expect(createWithoutPassword).toHaveBeenCalledWith({ email: "new@example.test" });
    expect(signUp).not.toHaveBeenCalled();
    expect(account.country).toBeNull();
    expect(accounts).toHaveLength(1);
  });

  it("records operator account creation inside the trusted identity transaction", async () => {
    const { identity, gateway } = dependencies();
    const record = vi.fn(async () => undefined);
    const service = new AuthenticationService(
      identity,
      gateway,
      { transaction: async (operation) => operation() },
      undefined,
      undefined,
      { record },
    );

    const account = await service.registerForOperator(
      { email: "created@example.test", username: "created", password: "random-bootstrap-pass" },
      "actor-id",
    );
    expect(record).toHaveBeenCalledWith({
      actorId: "actor-id",
      action: "operator.account_created",
      subjectType: "account",
      subjectId: account.id,
      previousState: null,
      newState: { username: "created", country: null },
    });
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

  it.each(["incomplete", "complete", "missing"] as const)(
    "preserves the %s auth-link state on the application principal",
    (linkState) => {
      const identity: AuthIdentityResolution =
        linkState === "complete"
          ? {
              state: "complete",
              account: new Account("550e8400-e29b-41d4-a716-446655440000", "buyer"),
            }
          : { state: linkState, account: null };
      const { service } = dependencies({
        identity,
        session: { user: { id: "auth-user" } },
      });
      return expect(service.principal(new Request("http://localhost"))).resolves.toMatchObject({
        authUserId: "auth-user",
        authLinkState: linkState,
        account: identity.account ? { username: "buyer" } : null,
      });
    },
  );

  it("reuses the unified resolver for completed-account lookup", async () => {
    const account = new Account("550e8400-e29b-41d4-a716-446655440000", "buyer");
    const { service, resolveAuthIdentity } = dependencies({
      identity: { state: "complete", account },
    });
    const resolved = await service.accountForAuthUser(account.id);
    expect(resolved).toEqual(account);
    expect(resolveAuthIdentity).toHaveBeenCalledWith(account.id);
  });
});
