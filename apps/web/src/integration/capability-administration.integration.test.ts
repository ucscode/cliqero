import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { OperatorAuthorizationService } from "@/modules/identity/operator";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("capability administration persistence", () => {
  const app = createContainer(databaseUrl!);
  const authorization = new OperatorAuthorizationService(app.database);

  beforeEach(() =>
    app.database.query(
      `truncate table kernel.audit_records,identity_capability.api_keys,referral_capability.account_referrals,identity_capability.account_capabilities,identity_capability.auth_account_links,better_auth."session",better_auth.account,better_auth.verification,better_auth."user",identity_capability.accounts restart identity cascade`,
    ),
  );
  afterAll(() => app.database.close());

  async function account(prefix: string) {
    return app.authentication.register({
      email: `${prefix}@example.com`,
      username: prefix,
      password: "correct-horse-battery",
      country: "NG",
    });
  }

  async function grantDirect(accountId: string, capability: string) {
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),$2)`,
      [accountId, capability],
    );
  }

  it("persists direct grants/revokes and append-only audit facts", async () => {
    const actor = await account("cap-admin");
    const target = await account("cap-target");
    await grantDirect(actor.id, "capabilities.manage");
    await grantDirect(actor.id, "catalogue.manage");

    const grant = await app.capabilityAdministration.grant(actor.id, target.id, "catalogue.manage");
    expect(grant.changed).toBe(true);
    expect(
      (await app.capabilityAdministration.grant(actor.id, target.id, "catalogue.manage")).changed,
    ).toBe(false);
    await expect(
      app.capabilityAdministration.grant(actor.id, target.id, "treasury.manage"),
    ).rejects.toMatchObject({ code: "capability_delegation_forbidden" });
    expect(
      (
        await app.database.query(
          `select count(*)::int count from kernel.audit_records where action='capability.granted'`,
        )
      ).rows[0].count,
    ).toBe(1);

    expect(
      (await app.capabilityAdministration.revoke(actor.id, target.id, "catalogue.manage")).changed,
    ).toBe(true);
    expect(await authorization.hasCapability(target.id, "catalogue.manage")).toBe(false);
    expect(
      (await app.capabilityAdministration.revoke(actor.id, target.id, "catalogue.manage")).changed,
    ).toBe(false);
  });

  it("serializes concurrent root self-revocation and leaves one root", async () => {
    const first = await account("root-first");
    const second = await account("root-second");
    await grantDirect(first.id, "system.root");
    await grantDirect(second.id, "system.root");

    const results = await Promise.allSettled([
      app.capabilityAdministration.revoke(first.id, first.id, "system.root"),
      app.capabilityAdministration.revoke(second.id, second.id, "system.root"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const roots = await app.database.query<{ count: string }>(
      `select count(*)::text count from identity_capability.account_capabilities where capability='system.root'`,
    );
    expect(roots.rows[0].count).toBe("1");
  });
});
