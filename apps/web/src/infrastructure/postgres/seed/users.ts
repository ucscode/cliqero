import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createContainer } from "@/infrastructure/container";
import { PostgresCapabilityAssignmentStore } from "@/infrastructure/postgres/identity/capability-administration";
import { Account } from "@/modules/identity/account";

export type DevelopmentUserFixture = {
  username: string;
  email: string;
  password: string;
  country: string;
  parentUsername: string | null;
};

const ROOT_PASSWORD = "CliqeroRoot!2026";
const CENTRAL_PASSWORD = "CliqeroCentral!2026";
const SECONDARY_PASSWORD = "CliqeroTree!2026";

export const DEVELOPMENT_USER_FIXTURES: readonly DevelopmentUserFixture[] = [
  {
    username: "tree_root",
    email: "tree_root@cliqero.test",
    password: ROOT_PASSWORD,
    country: "NG",
    parentUsername: null,
  },
  {
    username: "alpha",
    email: "alpha@cliqero.test",
    password: SECONDARY_PASSWORD,
    country: "NG",
    parentUsername: "tree_root",
  },
  {
    username: "alpha_one",
    email: "alpha_one@cliqero.test",
    password: SECONDARY_PASSWORD,
    country: "NG",
    parentUsername: "alpha",
  },
  {
    username: "central_user",
    email: "central_user@cliqero.test",
    password: CENTRAL_PASSWORD,
    country: "NG",
    parentUsername: "alpha_one",
  },
  {
    username: "central_left",
    email: "central_left@cliqero.test",
    password: SECONDARY_PASSWORD,
    country: "NG",
    parentUsername: "central_user",
  },
  {
    username: "central_left_1",
    email: "central_left_1@cliqero.test",
    password: SECONDARY_PASSWORD,
    country: "NG",
    parentUsername: "central_left",
  },
  {
    username: "central_left_2",
    email: "central_left_2@cliqero.test",
    password: SECONDARY_PASSWORD,
    country: "NG",
    parentUsername: "central_left",
  },
  {
    username: "central_left_3",
    email: "central_left_3@cliqero.test",
    password: SECONDARY_PASSWORD,
    country: "NG",
    parentUsername: "central_left",
  },
  {
    username: "central_right",
    email: "central_right@cliqero.test",
    password: SECONDARY_PASSWORD,
    country: "NG",
    parentUsername: "central_user",
  },
  {
    username: "central_right_1",
    email: "central_right_1@cliqero.test",
    password: SECONDARY_PASSWORD,
    country: "NG",
    parentUsername: "central_right",
  },
  {
    username: "central_right_2",
    email: "central_right_2@cliqero.test",
    password: SECONDARY_PASSWORD,
    country: "NG",
    parentUsername: "central_right",
  },
  {
    username: "central_leaf",
    email: "central_leaf@cliqero.test",
    password: SECONDARY_PASSWORD,
    country: "NG",
    parentUsername: "central_user",
  },
  {
    username: "alpha_peer",
    email: "alpha_peer@cliqero.test",
    password: SECONDARY_PASSWORD,
    country: "NG",
    parentUsername: "alpha_one",
  },
  {
    username: "alpha_two",
    email: "alpha_two@cliqero.test",
    password: SECONDARY_PASSWORD,
    country: "NG",
    parentUsername: "alpha",
  },
  {
    username: "beta",
    email: "beta@cliqero.test",
    password: SECONDARY_PASSWORD,
    country: "NG",
    parentUsername: "tree_root",
  },
  {
    username: "beta_one",
    email: "beta_one@cliqero.test",
    password: SECONDARY_PASSWORD,
    country: "NG",
    parentUsername: "beta",
  },
  {
    username: "beta_two",
    email: "beta_two@cliqero.test",
    password: SECONDARY_PASSWORD,
    country: "NG",
    parentUsername: "beta",
  },
  {
    username: "gamma",
    email: "gamma@cliqero.test",
    password: SECONDARY_PASSWORD,
    country: "NG",
    parentUsername: "tree_root",
  },
  {
    username: "gamma_one",
    email: "gamma_one@cliqero.test",
    password: SECONDARY_PASSWORD,
    country: "NG",
    parentUsername: "gamma",
  },
] as const;

export type DevelopmentUserFixtureValidation = {
  root: DevelopmentUserFixture;
  central: DevelopmentUserFixture;
  depths: ReadonlyMap<string, number>;
};

export function validateDevelopmentUserFixtures(
  fixtures: readonly DevelopmentUserFixture[] = DEVELOPMENT_USER_FIXTURES,
): DevelopmentUserFixtureValidation {
  if (fixtures.length === 0) throw new Error("Development user fixture tree cannot be empty");

  const usernames = new Set<string>();
  const emails = new Set<string>();
  const byUsername = new Map<string, DevelopmentUserFixture>();
  for (const fixture of fixtures) {
    if (usernames.has(fixture.username))
      throw new Error(`Duplicate development fixture username: ${fixture.username}`);
    if (emails.has(fixture.email))
      throw new Error(`Duplicate development fixture email: ${fixture.email}`);
    if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(fixture.username))
      throw new Error(`Invalid development fixture username: ${fixture.username}`);
    usernames.add(fixture.username);
    emails.add(fixture.email);
    byUsername.set(fixture.username, fixture);
  }

  const roots = fixtures.filter((fixture) => fixture.parentUsername === null);
  if (roots.length !== 1) throw new Error("Development user fixture tree must have one root");
  for (const fixture of fixtures) {
    if (fixture.parentUsername === fixture.username)
      throw new Error(`Development fixture cannot parent itself: ${fixture.username}`);
    if (fixture.parentUsername !== null && !byUsername.has(fixture.parentUsername))
      throw new Error(`Development fixture parent not found: ${fixture.parentUsername}`);
  }

  for (const fixture of fixtures) {
    const path = new Set<string>();
    let current: string | null = fixture.username;
    while (current !== null) {
      if (path.has(current))
        throw new Error(`Development fixture tree contains a cycle at ${current}`);
      path.add(current);
      current = byUsername.get(current)?.parentUsername ?? null;
    }
  }

  const root = roots[0];
  const depths = new Map<string, number>();
  function visit(username: string, depth: number, path: ReadonlySet<string>) {
    if (path.has(username))
      throw new Error(`Development fixture tree contains a cycle at ${username}`);
    depths.set(username, depth);
    const nextPath = new Set(path).add(username);
    for (const child of fixtures.filter((fixture) => fixture.parentUsername === username))
      visit(child.username, depth + 1, nextPath);
  }
  visit(root.username, 0, new Set());
  if (depths.size !== fixtures.length) throw new Error("Development fixture tree is disconnected");

  const central = byUsername.get("central_user");
  if (!central) throw new Error("central_user fixture is required");
  if (depths.get(central.username) !== 3)
    throw new Error("central_user must be exactly depth 3 below tree_root");
  const childrenOf = (parentUsername: string) =>
    fixtures
      .filter((fixture) => fixture.parentUsername === parentUsername)
      .map((fixture) => fixture.username)
      .sort();
  const expectChildren = (parentUsername: string, expected: readonly string[]) => {
    const actual = childrenOf(parentUsername);
    const expectedSorted = [...expected].sort();
    if (
      actual.length !== expectedSorted.length ||
      actual.some((username, index) => username !== expectedSorted[index])
    )
      throw new Error(
        `${parentUsername} must have exactly these direct children: ${[...expected].sort().join(", ")}`,
      );
  };
  expectChildren("central_user", ["central_left", "central_right", "central_leaf"]);
  expectChildren("central_left", ["central_left_1", "central_left_2", "central_left_3"]);
  expectChildren("central_right", ["central_right_1", "central_right_2"]);
  expectChildren("central_leaf", []);

  const centralDepth = depths.get(central.username)!;
  const centralDescendantDepths = fixtures
    .filter((fixture) => depths.get(fixture.username)! > centralDepth)
    .map((fixture) => depths.get(fixture.username)! - centralDepth);
  if (
    centralDescendantDepths.length !== 8 ||
    centralDescendantDepths.some((relativeDepth) => relativeDepth < 1 || relativeDepth > 2)
  )
    throw new Error("central_user must have exactly two seeded downline generations");

  return { root, central, depths };
}

type ExistingIdentity = { authUserId: string; accountId: string };

export async function seedDevelopmentUsers(
  databaseUrl = process.env.DATABASE_URL,
): Promise<{ count: number; root: string; central: string }> {
  assertDevelopmentSeedContext();
  const validation = validateDevelopmentUserFixtures();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const container = createContainer(databaseUrl);
  try {
    const accounts = new Map<string, Account>();
    for (const fixture of DEVELOPMENT_USER_FIXTURES) {
      const existing = await existingIdentity(container.database, fixture.email);
      const account = existing
        ? await reconcileExistingAccount(container, fixture, existing)
        : await container.authentication.register(fixture);
      accounts.set(fixture.username, account);
    }

    const root = accounts.get(validation.root.username)!;
    const central = accounts.get(validation.central.username)!;
    await bootstrapRootCapability(container.database, root.id);
    await removeFixtureCapabilities(container.database, accounts, root.id);
    for (const fixture of DEVELOPMENT_USER_FIXTURES) {
      if (!fixture.parentUsername) continue;
      const child = accounts.get(fixture.username)!;
      const parent = accounts.get(fixture.parentUsername)!;
      await container.referralGraphService.reassignParent(child.id, parent.id, root.id);
    }
    await assertRootHasNoParent(container.database, root.id);
    await verifyDevelopmentLogins(container, root, central);

    console.log(`Seeded ${DEVELOPMENT_USER_FIXTURES.length} development users.`);
    console.log("Seeded referral tree through depth 5.");
    console.log("\nRoot:");
    console.log(`  username: ${validation.root.username}`);
    console.log(`  email: ${validation.root.email}`);
    console.log(`  password: ${validation.root.password}`);
    console.log("\nCentral:");
    console.log(`  username: ${validation.central.username}`);
    console.log(`  email: ${validation.central.email}`);
    console.log(`  password: ${validation.central.password}`);

    return { count: DEVELOPMENT_USER_FIXTURES.length, root: root.id, central: central.id };
  } finally {
    await container.authentication.betterAuth.close();
    await container.database.close();
  }
}

async function existingIdentity(
  database: ReturnType<typeof createContainer>["database"],
  email: string,
): Promise<ExistingIdentity | null> {
  const result = await database.query<ExistingIdentity>(
    `select l.auth_user_id as "authUserId",a.uuid as "accountId"
       from better_auth."user" u
       join identity_capability.auth_account_links l on l.auth_user_id=u.id
       join identity_capability.accounts a on a.id=l.account_id
      where lower(u.email)=lower($1) and l.onboarding_state='complete'`,
    [email],
  );
  return result.rows[0] ?? null;
}

async function reconcileExistingAccount(
  container: ReturnType<typeof createContainer>,
  fixture: DevelopmentUserFixture,
  existing: ExistingIdentity,
) {
  const account = await container.profiles.update(existing.accountId, {
    username: fixture.username,
    country: fixture.country,
  });
  await container.authentication.resetPassword(existing.authUserId, fixture.password);
  return account;
}

async function bootstrapRootCapability(
  database: ReturnType<typeof createContainer>["database"],
  rootId: string,
) {
  // The normal administration service requires the actor to already possess
  // system.root. This is the one development-only first-root bootstrap, so use
  // the existing assignment persistence without weakening production auth.
  const assignments = new PostgresCapabilityAssignmentStore(database);
  await assignments.grant(rootId, "system.root");
}

async function removeFixtureCapabilities(
  database: ReturnType<typeof createContainer>["database"],
  accounts: ReadonlyMap<string, Account>,
  rootId: string,
) {
  const ids = [...accounts.values()].map((account) => account.id);
  await database.query(
    `delete from identity_capability.account_capabilities
      where account_id in (select id from identity_capability.accounts where uuid = any($1::uuid[]))
        and not (account_id=(select id from identity_capability.accounts where uuid=$2) and capability='system.root')`,
    [ids, rootId],
  );
}

async function assertRootHasNoParent(
  database: ReturnType<typeof createContainer>["database"],
  rootId: string,
) {
  const result = await database.query(
    `select 1 from referral_capability.account_referrals
      where child_account_id=(select id from identity_capability.accounts where uuid=$1)`,
    [rootId],
  );
  if (result.rowCount) throw new Error("tree_root already has a referral parent");
}

async function verifyDevelopmentLogins(
  container: ReturnType<typeof createContainer>,
  root: Account,
  central: Account,
) {
  const rootLogin = await container.authentication.login("tree_root@cliqero.test", ROOT_PASSWORD);
  if (rootLogin.account.id !== root.id)
    throw new Error("Root fixture login resolved the wrong account");
  await signOut(container, rootLogin.token);
  const centralLogin = await container.authentication.login(
    "central_user@cliqero.test",
    CENTRAL_PASSWORD,
  );
  if (centralLogin.account.id !== central.id)
    throw new Error("Central fixture login resolved the wrong account");
  await signOut(container, centralLogin.token);
}

async function signOut(container: ReturnType<typeof createContainer>, token: string) {
  await container.authentication.auth.api.signOut({
    headers: new Headers({ authorization: `Bearer ${token}` }),
  });
}

function assertDevelopmentSeedContext() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Development user fixtures are development-only");
  if (process.env.NODE_ENV !== "development")
    throw new Error("Development user fixtures require NODE_ENV=development");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seedDevelopmentUsers().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
