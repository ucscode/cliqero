import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  sendAuthEmail: vi.fn().mockResolvedValue(undefined),
}));

import { createContainer } from "@/infrastructure/container";
import {
  DEVELOPMENT_USER_PASSWORD,
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
      await app.database.query(
        `update better_auth."user" set email=$1,"updatedAt"=now()
           where id=(select links.auth_user_id
                       from identity_capability.auth_account_links links
                       join identity_capability.accounts account on account.id=links.account_id
                      where account.username=$2)`,
        ["central_user@cliqero.test", "central_user"],
      );
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
    expect(counts.rows[0]).toEqual({ users: "19", links: "19", edges: "18" });
    expect(
      (
        await app.database.query(
          `select count(*)::text as count from better_auth."user" where email='central_user@cliqero.test'`,
        )
      ).rows[0].count,
    ).toBe("0");

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
    expect(centralTree.nodes).toHaveLength(9);
    expect(new Set(centralTree.nodes.map((node) => node.username))).toEqual(
      new Set([
        "central_user",
        "central_left",
        "central_right",
        "central_leaf",
        "central_left_1",
        "central_left_2",
        "central_left_3",
        "central_right_1",
        "central_right_2",
      ]),
    );
    expect(centralTree.edges).toHaveLength(8);
    const childCounts = await app.database.query<{ username: string; child_count: string }>(
      `select parent.username,
              count(child.id)::text as child_count
         from identity_capability.accounts parent
         left join referral_capability.account_referrals relationship
           on relationship.parent_account_id=parent.id
         left join identity_capability.accounts child
           on child.id=relationship.child_account_id
        where parent.username = any($1::text[])
        group by parent.username`,
      [["central_user", "central_left", "central_right", "central_leaf"]],
    );
    expect(new Map(childCounts.rows.map((row) => [row.username, row.child_count]))).toEqual(
      new Map([
        ["central_user", "3"],
        ["central_left", "3"],
        ["central_right", "2"],
        ["central_leaf", "0"],
      ]),
    );
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

    for (const fixture of DEVELOPMENT_USER_FIXTURES) {
      const accountId = (
        await app.database.query<{ id: string }>(
          `select uuid as id from identity_capability.accounts where username=$1`,
          [fixture.username],
        )
      ).rows[0].id;
      const login = await app.authentication.login(fixture.email, DEVELOPMENT_USER_PASSWORD);
      expect(login.account.id).toBe(accountId);
      await app.authentication.auth.api.signOut({
        headers: new Headers({ authorization: `Bearer ${login.token}` }),
      });
    }
    expect(root).toBeDefined();
    expect(central).toBeDefined();
  }, 30_000);
});
