import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { handlePasswordReset } from "@/api/compat/password-reset/route";

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

  it("compensates a newly-created Better Auth identity when the username is already taken", async () => {
    await app.authentication.register({
      email: "first@example.com",
      username: "claimedusername",
      password: "correct-horse-battery",
    });

    await expect(
      app.authentication.register({
        email: "second@example.com",
        username: "claimedusername",
        password: "correct-horse-battery",
      }),
    ).rejects.toMatchObject({
      code: "username_taken",
      fields: { username: "That username is already taken." },
    });

    expect(
      (
        await app.database.query<{ count: string }>(
          `select count(*)::text as count from better_auth."user"`,
        )
      ).rows[0].count,
    ).toBe("1");
    expect(
      (
        await app.database.query<{ count: string }>(
          `select count(*)::text as count from identity_capability.accounts`,
        )
      ).rows[0].count,
    ).toBe("1");
    expect(
      (
        await app.database.query<{ count: string }>(
          `select count(*)::text as count from better_auth.session`,
        )
      ).rows[0].count,
    ).toBe("0");
  });

  it("keeps an existing email registration attempt generic without creating another identity", async () => {
    await app.authentication.register({
      email: "existing@example.com",
      username: "existinguser",
      password: "correct-horse-battery",
    });

    await expect(
      app.authentication.register({
        email: "existing@example.com",
        username: "anotheruser",
        password: "correct-horse-battery",
      }),
    ).rejects.toMatchObject({ code: "registration_failed" });

    expect(
      (
        await app.database.query<{ count: string }>(
          `select count(*)::text as count from better_auth."user"`,
        )
      ).rows[0].count,
    ).toBe("1");
    expect(
      (
        await app.database.query<{ count: string }>(
          `select count(*)::text as count from identity_capability.accounts`,
        )
      ).rows[0].count,
    ).toBe("1");
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

  it("resets a password with a fresh one-time Better Auth reset token", async () => {
    const email = "browser-reset@example.com";
    await app.authentication.register({
      email,
      username: "browserreset",
      password: "password-before-reset",
    });
    await app.authentication.auth.api.requestPasswordReset({
      body: { email, redirectTo: "http://localhost:3000/reset-password" },
    });
    const verification = (
      await app.database.query<{ identifier: string }>(
        `select identifier from better_auth.verification where identifier like 'reset-password:%'`,
      )
    ).rows[0];
    const token = verification.identifier.slice("reset-password:".length);

    await app.authentication.auth.api.resetPassword({
      body: { token, newPassword: "password-after-reset" },
    });
    await expect(app.authentication.login(email, "password-before-reset")).rejects.toThrow(
      "Invalid credentials",
    );
    await expect(app.authentication.login(email, "password-after-reset")).resolves.toBeDefined();
    await expect(
      app.authentication.auth.api.resetPassword({
        body: { token, newPassword: "another-password" },
      }),
    ).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });
  });

  it("resets through the public compatibility boundary with a token generated by Better Auth", async () => {
    const email = "compat-browser-reset@example.com";
    await app.authentication.register({
      email,
      username: "compatreset",
      password: "password-before-reset",
    });
    await app.authentication.auth.handler(
      new Request("http://localhost:3000/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, redirectTo: "http://localhost:3000/reset-password" }),
      }),
    );
    const verification = (
      await app.database.query<{ identifier: string }>(
        `select identifier from better_auth.verification where identifier like 'reset-password:%' and value=(select id from better_auth."user" where email=$1) order by "createdAt" desc limit 1`,
        [email],
      )
    ).rows[0];
    const token = verification.identifier.slice("reset-password:".length);
    const callback = await app.authentication.auth.handler(
      new Request(
        `http://localhost:3000/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent("http://localhost:3000/reset-password")}`,
      ),
    );
    expect(callback.status).toBe(302);
    const callbackToken = new URL(callback.headers.get("location")!).searchParams.get("token");
    expect(callbackToken).toBe(token);
    const response = await handlePasswordReset(
      new Request("http://localhost:3000/api/password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: callbackToken, newPassword: "password-after-reset" }),
      }),
      app.authentication.auth,
    );
    expect(response.status).toBe(200);
    await expect(app.authentication.login(email, "password-before-reset")).rejects.toThrow(
      "Invalid credentials",
    );
    await expect(app.authentication.login(email, "password-after-reset")).resolves.toBeDefined();
    const reuse = await handlePasswordReset(
      new Request("http://localhost:3000/api/password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: callbackToken, newPassword: "another-password" }),
      }),
      app.authentication.auth,
    );
    expect(reuse.status).toBe(400);
    await expect(reuse.json()).resolves.toMatchObject({ code: "invalid_reset_token" });
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

  it("lets an OAuth-only account create a Better Auth credential during onboarding", async () => {
    const result = await app.authentication.auth.api.signUpEmail({
      body: {
        name: "Google Display Name",
        email: "oauth-only@example.com",
        password: "temporary-password",
      },
    });
    const context = await app.authentication.auth.$context;
    const credential = await context.internalAdapter.findCredentialAccount(result.user.id);
    expect(credential).not.toBeNull();
    await context.internalAdapter.deleteAccount(credential!.id);
    await context.internalAdapter.createAccount({
      userId: result.user.id,
      providerId: "google",
      accountId: "google-oauth-subject",
      issuer: "https://accounts.google.com",
    });
    const session = await context.internalAdapter.createSession(result.user.id);
    expect(session).not.toBeNull();
    expect(await app.authentication.hasPasswordCredential(result.user.id)).toBe(false);

    const account = await app.authentication.completeOnboarding(
      result.user.id,
      { username: "oauthuser", country: "NG", password: "oauth-password" },
      new Headers({ authorization: `Bearer ${session!.token}` }),
    );

    expect(await app.authentication.hasPasswordCredential(result.user.id)).toBe(true);
    expect(
      (
        await app.database.query<{ provider_id: string }>(
          `select "providerId" provider_id from better_auth.account where "userId"=$1 order by "providerId"`,
          [result.user.id],
        )
      ).rows.map((row) => row.provider_id),
    ).toEqual(["credential", "google"]);
    expect(
      (await app.authentication.login("oauth-only@example.com", "oauth-password")).account.id,
    ).toBe(account.id);
    expect(
      (
        await app.database.query<{ display_name: string }>(
          `select display_name from better_auth."user" where id=$1`,
          [result.user.id],
        )
      ).rows[0].display_name,
    ).toBe("Google Display Name");
  });

  it("compensates a newly added OAuth credential when onboarding cannot claim the username", async () => {
    await app.authentication.register({
      email: "taken-onboarding@example.com",
      username: "takenonboarding",
      password: "existing-password",
    });
    const result = await app.authentication.auth.api.signUpEmail({
      body: {
        name: "OAuth User",
        email: "oauth-conflict@example.com",
        password: "temporary-password",
      },
    });
    const context = await app.authentication.auth.$context;
    const existingCredential = await context.internalAdapter.findCredentialAccount(result.user.id);
    await context.internalAdapter.deleteAccount(existingCredential!.id);
    const session = await context.internalAdapter.createSession(result.user.id);

    await expect(
      app.authentication.completeOnboarding(
        result.user.id,
        { username: "takenonboarding", password: "oauth-password" },
        new Headers({ authorization: `Bearer ${session!.token}` }),
      ),
    ).rejects.toMatchObject({ code: "username_taken" });
    expect(await app.authentication.hasPasswordCredential(result.user.id)).toBe(false);
  });

  it("keeps account linking explicit and requires verified local email ownership", () => {
    expect(app.authentication.auth.options.account?.accountLinking).toMatchObject({
      enabled: true,
      requireLocalEmailVerified: true,
      allowDifferentEmails: false,
    });
  });
});
