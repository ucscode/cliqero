import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("Better Auth and Cliqero identity boundary", () => {
  const app = createContainer(databaseUrl!);
  beforeEach(async () => {
    await app.database.query(`truncate table
      better_auth."session",better_auth.account,better_auth.verification,better_auth."user",
      identity_capability.auth_account_links,identity_capability.sessions,identity_capability.accounts
      restart identity cascade`);
  });
  afterAll(async () => {
    await app.database.close();
    await app.authentication.betterAuth.close();
  });

  it("creates one Better Auth identity mapped to one Cliqero account", async () => {
    const email = "auth@example.com";
    const account = await app.authentication.register({
      email,
      username: "authuser",
      password: "correct-horse-battery",
      country: "NG",
    });
    const rows = await app.database.query<{
      auth_user_id: string;
      account_id: string;
      onboarding_state: string;
    }>(
      `select links.auth_user_id,a.uuid as account_id,links.onboarding_state
       from identity_capability.auth_account_links links
       join identity_capability.accounts a on a.id=links.account_id`,
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]).toMatchObject({ account_id: account.id, onboarding_state: "complete" });
    expect(
      (
        await app.database.query<{ column_name: string }>(
          `select column_name from information_schema.columns
            where table_schema='identity_capability' and table_name='accounts'
              and column_name in ('email','display_name','password_salt','password_hash')`,
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await app.database.query<{ email: string; display_name: string }>(
          `select u.email,u.display_name from better_auth."user" u
           join identity_capability.auth_account_links links on links.auth_user_id=u.id
           join identity_capability.accounts a on a.id=links.account_id
           where a.uuid=$1`,
          [account.id],
        )
      ).rows[0],
    ).toEqual({ email, display_name: "" });
    await expect(app.profiles.get(account.id)).resolves.toEqual({
      email,
      username: "authuser",
      displayName: null,
      country: "NG",
    });
  });

  it("supports Better Auth credential login, bearer resolution and session revocation", async () => {
    const email = "login@example.com";
    const account = await app.authentication.register({
      email,
      username: "loginuser",
      password: "correct-horse-battery",
    });
    const result = await app.authentication.login(email, "correct-horse-battery");
    expect((await app.authentication.authenticate(result.token))?.id).toBe(account.id);
    await expect(app.authentication.login(email, "wrong-password")).rejects.toThrow(
      "Invalid credentials",
    );
    await app.authentication.auth.api.signOut({
      headers: new Headers({ authorization: `Bearer ${result.token}` }),
    });
    await expect(app.authentication.authenticate(result.token)).resolves.toBeNull();
  });

  it("resets a credential without requiring the previous password", async () => {
    const email = "console-reset@example.com";
    const account = await app.authentication.register({
      email,
      username: "console_reset",
      password: "console-reset-password-a",
    });
    const authUserId = (
      await app.database.query<{ auth_user_id: string }>(
        `select auth_user_id from identity_capability.auth_account_links where account_id=(select id from identity_capability.accounts where uuid=$1)`,
        [account.id],
      )
    ).rows[0].auth_user_id;

    await app.authentication.resetPassword(authUserId, "console-reset-password-b");

    await expect(app.authentication.login(email, "console-reset-password-a")).rejects.toThrow(
      "Invalid credentials",
    );
    await expect(
      app.authentication.login(email, "console-reset-password-b"),
    ).resolves.toMatchObject({ account: { id: account.id } });
  });

  it("uses Better Auth's HTTP-only cookie response for the compatibility login endpoint", async () => {
    const email = "cookie@example.com";
    const account = await app.authentication.register({
      email,
      username: "cookieuser",
      password: "correct-horse-battery",
    });
    const response = await app.authentication.auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: "correct-horse-battery" }),
      }),
    );
    expect(response.ok).toBe(true);
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("better-auth");
    const session = await app.authentication.auth.api.getSession({
      headers: new Headers({ cookie: cookie!.split(";")[0] }),
    });
    expect(session?.user.email).toBe(email);
    expect(
      (
        await app.authentication.authenticateRequest(
          new Request("http://localhost:3000", { headers: { cookie: cookie!.split(";")[0] } }),
        )
      )?.id,
    ).toBe(account.id);
  });

  it("represents social-first users as authenticated but incomplete until onboarding", async () => {
    const result = await app.authentication.auth.api.signUpEmail({
      body: { name: "social user", email: "social@example.com", password: "correct-horse-battery" },
    });
    const session = await app.authentication.auth.api.signInEmail({
      body: { email: result.user.email, password: "correct-horse-battery" },
    });
    const principal = await app.authentication.principal(
      new Request("http://localhost:3000", {
        headers: { authorization: `Bearer ${session.token!}` },
      }),
    );
    expect(principal?.account).toBeNull();
    const account = await app.authentication.completeOnboarding(result.user.id, {
      username: "socialuser",
      country: "NG",
    });
    expect((await app.authentication.authenticate(session.token!))?.id).toBe(account.id);
    const repeatedLogin = await app.authentication.auth.api.signInEmail({
      body: { email: result.user.email, password: "correct-horse-battery" },
    });
    expect((await app.authentication.authenticate(repeatedLogin.token!))?.id).toBe(account.id);
    expect(
      (
        await app.database.query<{ display_name: string }>(
          `select display_name from better_auth."user" u
           join identity_capability.auth_account_links l on l.auth_user_id=u.id
           where l.account_id=(select id from identity_capability.accounts where uuid=$1)`,
          [account.id],
        )
      ).rows[0].display_name,
    ).toBe("social user");
  });

  it("keeps account linking explicit and requires verified local email ownership", () => {
    expect(app.authentication.auth.options.account?.accountLinking).toMatchObject({
      enabled: true,
      requireLocalEmailVerified: true,
      allowDifferentEmails: false,
    });
  });
});
