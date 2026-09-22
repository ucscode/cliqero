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

export const DEVELOPMENT_USER_PASSWORD = "CliqeroTest!2026";

export function developmentUserEmail(username: string): string {
  return `${username}@example.test`;
}

type DevelopmentUserDefinition = Omit<DevelopmentUserFixture, "email" | "password">;

function developmentUser(definition: DevelopmentUserDefinition): DevelopmentUserFixture {
  return {
    ...definition,
    email: developmentUserEmail(definition.username),
    password: DEVELOPMENT_USER_PASSWORD,
  };
}

export const DEVELOPMENT_USER_FIXTURES: readonly DevelopmentUserFixture[] = [
  developmentUser({
    username: "tree_root",
    country: "NG",
    parentUsername: null,
  }),
  developmentUser({
    username: "alpha",
    country: "NG",
    parentUsername: "tree_root",
  }),
  developmentUser({
    username: "alpha_one",
    country: "NG",
    parentUsername: "alpha",
  }),
  developmentUser({
    username: "central_user",
    country: "NG",
    parentUsername: "alpha_one",
  }),
  developmentUser({
    username: "central_left",
    country: "NG",
    parentUsername: "central_user",
  }),
  developmentUser({
    username: "central_left_1",
    country: "NG",
    parentUsername: "central_left",
  }),
  developmentUser({
    username: "central_left_2",
    country: "NG",
    parentUsername: "central_left",
  }),
  developmentUser({
    username: "central_left_3",
    country: "NG",
    parentUsername: "central_left",
  }),
  developmentUser({
    username: "central_right",
    country: "NG",
    parentUsername: "central_user",
  }),
  developmentUser({
    username: "central_right_1",
    country: "NG",
    parentUsername: "central_right",
  }),
  developmentUser({
    username: "central_right_2",
    country: "NG",
    parentUsername: "central_right",
  }),
  developmentUser({
    username: "central_leaf",
    country: "NG",
    parentUsername: "central_user",
  }),
  developmentUser({
    username: "alpha_peer",
    country: "NG",
    parentUsername: "alpha_one",
  }),
  developmentUser({
    username: "alpha_two",
    country: "NG",
    parentUsername: "alpha",
  }),
  developmentUser({
    username: "beta",
    country: "NG",
    parentUsername: "tree_root",
  }),
  developmentUser({
    username: "beta_one",
    country: "NG",
    parentUsername: "beta",
  }),
  developmentUser({
    username: "beta_two",
    country: "NG",
    parentUsername: "beta",
  }),
  developmentUser({
    username: "gamma",
    country: "NG",
    parentUsername: "tree_root",
  }),
  developmentUser({
    username: "gamma_one",
    country: "NG",
    parentUsername: "gamma",
  }),
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
    if (fixture.email !== developmentUserEmail(fixture.username))
      throw new Error(`Development fixture email must match its username: ${fixture.username}`);
    if (fixture.password !== DEVELOPMENT_USER_PASSWORD)
      throw new Error(`Development fixtures must share one password: ${fixture.username}`);
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
    .filter((fixture) => isDescendantOf(fixture.username, central.username, byUsername))
    .map((fixture) => depths.get(fixture.username)! - centralDepth);
  if (
    centralDescendantDepths.length !== 8 ||
    centralDescendantDepths.some((relativeDepth) => relativeDepth < 1 || relativeDepth > 2)
  )
    throw new Error("central_user must have exactly two seeded downline generations");

  return { root, central, depths };
}

function isDescendantOf(
  username: string,
  ancestorUsername: string,
  byUsername: ReadonlyMap<string, DevelopmentUserFixture>,
) {
  const visited = new Set<string>();
  let current = byUsername.get(username)?.parentUsername ?? null;
  while (current !== null) {
    if (current === ancestorUsername) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    current = byUsername.get(current)?.parentUsername ?? null;
  }
  return false;
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
      const existing = await existingIdentity(container.database, fixture);
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
    await verifyDevelopmentLogins(container, accounts);

    console.log(`Seeded ${DEVELOPMENT_USER_FIXTURES.length} development users.`);
    console.log("Seeded referral tree through depth 5.");
    console.log("\nDevelopment fixture login:");
    console.log("  email: <username>@example.test");
    console.log(`  password: ${DEVELOPMENT_USER_PASSWORD}`);
    console.log(`  root username: ${validation.root.username}`);
    console.log(`  central username: ${validation.central.username}`);

    return { count: DEVELOPMENT_USER_FIXTURES.length, root: root.id, central: central.id };
  } finally {
    await container.authentication.betterAuth.close();
    await container.database.close();
  }
}

async function existingIdentity(
  database: ReturnType<typeof createContainer>["database"],
  fixture: DevelopmentUserFixture,
): Promise<ExistingIdentity | null> {
  const result = await database.query<ExistingIdentity>(
    `select l.auth_user_id as "authUserId",a.uuid as "accountId"
       from better_auth."user" u
       join identity_capability.auth_account_links l on l.auth_user_id=u.id
       join identity_capability.accounts a on a.id=l.account_id
      where a.username=$1 and l.onboarding_state='complete'`,
    [fixture.username],
  );
  if (result.rows.length > 1)
    throw new Error(`Multiple linked identities found for fixture: ${fixture.username}`);
  return result.rows[0] ?? null;
}

async function reconcileExistingAccount(
  container: ReturnType<typeof createContainer>,
  fixture: DevelopmentUserFixture,
  existing: ExistingIdentity,
) {
  const conflictingEmail = await container.database.query<{ id: string }>(
    `select id
       from better_auth."user"
      where lower(email)=lower($1) and id<>$2`,
    [fixture.email, existing.authUserId],
  );
  if (conflictingEmail.rowCount)
    throw new Error(`Development fixture email is already linked: ${fixture.email}`);
  await container.database.query(
    `update better_auth."user" set email=$2,"updatedAt"=now() where id=$1`,
    [existing.authUserId, fixture.email],
  );
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
  accounts: ReadonlyMap<string, Account>,
) {
  for (const fixture of DEVELOPMENT_USER_FIXTURES) {
    const login = await container.authentication.login(fixture.email, DEVELOPMENT_USER_PASSWORD);
    if (login.account.id !== accounts.get(fixture.username)?.id)
      throw new Error(`Fixture login resolved the wrong account: ${fixture.username}`);
    await signOut(container, login.token);
  }
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
