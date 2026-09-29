import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("operator account index PostgreSQL projection", () => {
  const app = createContainer(databaseUrl!);

  beforeEach(async () => {
    await app.database.query(`truncate table
      kernel.audit_records,better_auth."session",better_auth.account,better_auth.verification,
      better_auth."user",identity_capability.auth_account_links,identity_capability.sessions,
      identity_capability.accounts restart identity cascade`);
  });

  afterAll(async () => {
    await app.database.close();
    await app.authentication.betterAuth.close();
  });

  it("lists canonical accounts, searches profile fields, and paginates without skips or repeats", async () => {
    const first = await app.authentication.register({
      email: "ops.account.first@example.test",
      username: "ops_account_first",
      password: "correct-horse-battery",
      country: "NG",
    });
    const second = await app.authentication.register({
      email: "ops.account.second@example.test",
      username: "ops_account_second",
      password: "correct-horse-battery",
      country: "GH",
    });
    const third = await app.authentication.register({
      email: "ops.account.third@example.test",
      username: "ops_account_third",
      password: "correct-horse-battery",
      country: "US",
    });
    const noAuthMetadata = (
      await app.database.query<{ uuid: string }>(
        `insert into identity_capability.accounts(username,metadata)
         values('ops_account_noauth','{"country":"GB"}'::jsonb) returning uuid`,
      )
    ).rows[0].uuid;
    const child = await app.authentication.register({
      email: "ops.account.child@example.test",
      username: "ops_account_child",
      password: "correct-horse-battery",
      country: "NG",
    });

    const ids = [first.id, second.id, third.id, noAuthMetadata, child.id];
    const stableTimestamp = "2026-01-01T00:00:00.000Z";
    await app.database.query(
      `update identity_capability.accounts set created_at=$1::timestamptz where uuid=any($2::uuid[])`,
      [stableTimestamp, ids],
    );
    await app.database.query(
      `insert into referral_capability.account_referrals(child_account_id,parent_account_id)
       select child.id,parent.id from identity_capability.accounts child
       join identity_capability.accounts parent on parent.uuid=$2
       where child.uuid=$1`,
      [child.id, first.id],
    );

    const firstPage = await app.operatorAccounts.list({ limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeTruthy();

    const all = [...firstPage.items];
    let cursor = firstPage.nextCursor;
    while (cursor) {
      const page = await app.operatorAccounts.list({ limit: 2, cursor });
      all.push(...page.items);
      cursor = page.nextCursor;
    }
    expect(all.map((account) => account.id)).toEqual([...ids].reverse());
    expect(new Set(all.map((account) => account.id)).size).toBe(ids.length);

    const withoutAuth = all.find((account) => account.id === noAuthMetadata);
    expect(withoutAuth).toMatchObject({
      username: "ops_account_noauth",
      email: null,
      country: "GB",
    });
    expect(all.find((account) => account.id === first.id)?.directReferralCount).toBe(1);

    await expect(
      app.operatorAccounts.list({ search: "ops_account_second", limit: 10 }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ id: second.id })] });
    await expect(
      app.operatorAccounts.list({ search: "ops.account.third@example.test", limit: 10 }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ id: third.id })] });
    await expect(app.operatorAccounts.list({ search: child.id, limit: 10 })).resolves.toMatchObject(
      {
        items: [expect.objectContaining({ id: child.id })],
      },
    );
    await expect(
      app.operatorAccounts.list({ search: "ops_account_", limit: 10 }),
    ).resolves.toMatchObject({
      items: expect.arrayContaining(ids.map((id) => expect.objectContaining({ id }))),
    });
  });
});
