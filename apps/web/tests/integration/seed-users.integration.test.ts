import { afterAll, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import {
  DEVELOPMENT_USER_FIXTURES,
  seedDevelopmentUsers,
} from "@/infrastructure/postgres/seed/users";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl && process.env.NODE_ENV !== "production" ? describe : describe.skip;

suite("development referral user seed", () => {
  const app = createContainer(databaseUrl!);

  afterAll(async () => {
    await app.database.close();
    await app.authentication.betterAuth.close();
  });

  it("persists authenticatable users and converges on rerun", async () => {
    const environment = process.env as Record<string, string | undefined>;
    const previousNodeEnvironment = environment.NODE_ENV;
    environment.NODE_ENV = "development";
    let first: Awaited<ReturnType<typeof seedDevelopmentUsers>>;
    let second: Awaited<ReturnType<typeof seedDevelopmentUsers>>;
    try {
      first = await seedDevelopmentUsers(databaseUrl);
      second = await seedDevelopmentUsers(databaseUrl);
    } finally {
      if (previousNodeEnvironment === undefined) Reflect.deleteProperty(environment, "NODE_ENV");
      else environment.NODE_ENV = previousNodeEnvironment;
    }
    expect(second).toEqual(first);

    const counts = await app.database.query<{ users: string; links: string; edges: string }>(
      `select
         (select count(*) from better_auth."user" where email = any($1::text[]))::text users,
         (select count(*) from identity_capability.auth_account_links
            where onboarding_state='complete'
              and account_id in (select id from identity_capability.accounts where username = any($2::text[])))::text links,
         (select count(*) from referral_capability.account_referrals
            where child_account_id in (select id from identity_capability.accounts where username = any($2::text[])))::text edges`,
      [
        DEVELOPMENT_USER_FIXTURES.map((fixture) => fixture.email),
        DEVELOPMENT_USER_FIXTURES.map((fixture) => fixture.username),
      ],
    );
    expect(counts.rows[0]).toEqual({ users: "17", links: "17", edges: "16" });

    const root = (
      await app.database.query<{ id: string }>(
        `select uuid as id from identity_capability.accounts where username='tree_root'`,
      )
    ).rows[0].id;
    const central = (
      await app.database.query<{ id: string }>(
        `select uuid as id from identity_capability.accounts where username='central_user'`,
      )
    ).rows[0].id;
    expect(
      await app.referralGraph.getRelationshipDepth(root, central, DEVELOPMENT_USER_FIXTURES.length),
    ).toBe(3);
    for (const fixture of DEVELOPMENT_USER_FIXTURES) {
      const accountId = (
        await app.database.query<{ id: string }>(
          `select uuid as id from identity_capability.accounts where username=$1`,
          [fixture.username],
        )
      ).rows[0].id;
      await expect(app.hierarchy.isDescendantOrSelf(root, accountId)).resolves.toBe(true);
    }
    const centralTree = await app.hierarchy.tree(central, central, false);
    expect(centralTree.nodes.map((node) => node.username)).toEqual([
      "central_user",
      "central_left",
      "central_right",
      "central_left_1",
      "central_left_2",
      "central_right_1",
      "central_right_2",
    ]);
    expect(
      (
        await app.database.query<{ capability: string }>(
          `select capability from identity_capability.account_capabilities
             where account_id=(select id from identity_capability.accounts where uuid=$1)`,
          [root],
        )
      ).rows,
    ).toEqual([{ capability: "system.root" }]);
    expect(
      (
        await app.database.query(
          `select 1 from identity_capability.account_capabilities
             where account_id=(select id from identity_capability.accounts where uuid=$1)`,
          [central],
        )
      ).rowCount,
    ).toBe(0);

    await expect(
      app.authentication.login("tree_root@cliqero.test", "CliqeroRoot!2026"),
    ).resolves.toMatchObject({
      account: { id: root },
    });
    await expect(
      app.authentication.login("central_user@cliqero.test", "CliqeroCentral!2026"),
    ).resolves.toMatchObject({ account: { id: central } });
  });
});
