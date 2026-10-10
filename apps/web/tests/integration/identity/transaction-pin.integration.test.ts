import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";

const recoveryMail = vi.hoisted(() => ({ code: null as string | null }));
vi.mock("@/lib/email", () => ({
  sendAuthEmail: async () => undefined,
  sendTransactionPinRecoveryCode: async (_email: string, code: string) => {
    recoveryMail.code = code;
  },
}));

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("PostgreSQL transaction PIN persistence", () => {
  const app = createContainer(databaseUrl!);

  beforeEach(async () => {
    await app.database.query(
      `truncate table identity_capability.transaction_pin_credentials,
       better_auth."session",better_auth.account,better_auth.verification,better_auth."user",
       identity_capability.auth_account_links,identity_capability.sessions,identity_capability.accounts
       restart identity cascade`,
    );
  });

  afterAll(async () => {
    await app.database.close();
    await app.authentication.betterAuth.close();
  });

  it("persists only a password hash and serializes failed attempts into a lockout", async () => {
    const account = await app.authentication.register({
      email: `pin-${newId()}@example.test`,
      username: `pin${newId().replaceAll("-", "").slice(0, 12)}`,
      password: "correct-horse-battery",
      country: "NG",
    });
    await app.database.query(
      `update better_auth."user" auth_user set "emailVerified"=true
        from identity_capability.auth_account_links link
        join identity_capability.accounts account on account.id=link.account_id
       where link.auth_user_id=auth_user.id and account.uuid=$1`,
      [account.id],
    );

    await app.transactionPin.set(account.id, "123456");
    const stored = await app.database.query<{ pin_hash: string; failed_attempts: number }>(
      `select pin_hash,failed_attempts
         from identity_capability.transaction_pin_credentials
        where account_id=(select id from identity_capability.accounts where uuid=$1)`,
      [account.id],
    );
    expect(stored.rows[0]?.pin_hash).not.toBe("123456");
    await expect(app.transactionPin.requireValidPin(account.id, "123456")).resolves.toBeUndefined();

    for (let attempt = 0; attempt < 4; attempt += 1)
      await expect(app.transactionPin.requireValidPin(account.id, "999999")).rejects.toMatchObject({
        code: "invalid_transaction_pin",
      });
    await expect(app.transactionPin.requireValidPin(account.id, "999999")).rejects.toMatchObject({
      code: "transaction_pin_locked",
      status: 429,
    });
    const locked = await app.database.query<{ failed_attempts: number; locked: boolean }>(
      `select failed_attempts,locked_until > now() locked
         from identity_capability.transaction_pin_credentials
        where account_id=(select id from identity_capability.accounts where uuid=$1)`,
      [account.id],
    );
    expect(locked.rows[0]).toEqual({ failed_attempts: 0, locked: true });

    recoveryMail.code = null;
    await app.transactionPin.requestRecovery(account.id);
    expect(recoveryMail.code).toMatch(/^\d{6}$/);
    await app.transactionPin.recover(account.id, recoveryMail.code!, "654321");
    await expect(app.transactionPin.requireValidPin(account.id, "654321")).resolves.toBeUndefined();
    await expect(app.transactionPin.recover(account.id, recoveryMail.code!, "654322")).rejects.toMatchObject({
      code: "transaction_pin_recovery_invalid",
    });
  });
});
