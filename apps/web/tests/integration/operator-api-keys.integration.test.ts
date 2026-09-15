import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApiApp } from "@/api/hono";
import { createContainer } from "@/infrastructure/container";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("operator API-key administration", () => {
  const app = createContainer(databaseUrl!);
  beforeEach(() =>
    app.database.query(
      `truncate table kernel.audit_records,identity_capability.api_keys,identity_capability.account_capabilities,identity_capability.auth_account_links,better_auth."session",better_auth.account,better_auth.verification,better_auth."user",identity_capability.accounts restart identity cascade`,
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
  async function grant(accountId: string, capability: string) {
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),$2)`,
      [accountId, capability],
    );
  }
  function sessionApi(accountId: string, capabilities: string[]) {
    return createApiApp({
      ...app,
      principalResolver: {
        resolve: async () => ({
          accountId,
          account: { id: accountId, username: "operator", country: "NG" },
          kind: "user_session" as const,
          capabilities,
          scopes: new Set<string>(),
        }),
      },
    } as any);
  }

  it("creates safe target-scoped credentials, audits changes, and revokes idempotently", async () => {
    const actor = await account("keyoperator");
    const target = await account("keytarget");
    await grant(actor.id, "api_keys.manage");
    await grant(actor.id, "catalogue.manage");
    await grant(actor.id, "capabilities.manage");
    await grant(target.id, "catalogue.manage");
    const api = sessionApi(actor.id, ["api_keys.manage", "catalogue.manage"]);

    const createdResponse = await api.fetch(
      new Request(`http://localhost/api/operator/accounts/${target.id}/api-keys`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "catalogue automation", scopes: ["catalogue:manage"] }),
      }),
    );
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    expect(created.secret).toMatch(/^cliq_live_/);
    expect(created.key_prefix).toBe(created.secret.slice(0, 18));

    const listed = await api.fetch(
      new Request(`http://localhost/api/operator/accounts/${target.id}/api-keys`),
    );
    expect(listed.status).toBe(200);
    const body = await listed.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].secret).toBeUndefined();
    expect(body.items[0].secret_hash).toBeUndefined();
    expect(body.items[0].scopes).toEqual(["catalogue:manage"]);
    expect(body.manageable_scopes).toContain("catalogue:manage");

    const audit = await app.database.query<{
      actor_id: string;
      subject_id: string;
      action: string;
      new_state: Record<string, unknown>;
    }>(
      `select actor.uuid actor_id,subject_id,action,new_state
         from kernel.audit_records audit
         join identity_capability.accounts actor on actor.id=audit.actor_id
        where subject_type='api_key' order by audit.id`,
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      actor_id: actor.id,
      subject_id: created.id,
      action: "api_key.created",
    });
    expect(JSON.stringify(audit.rows[0].new_state)).not.toContain(created.secret);

    const revoked = await api.fetch(
      new Request(
        `http://localhost/api/operator/accounts/${target.id}/api-keys/${created.id}/revoke`,
        {
          method: "POST",
        },
      ),
    );
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toEqual({ changed: true });
    const repeated = await api.fetch(
      new Request(
        `http://localhost/api/operator/accounts/${target.id}/api-keys/${created.id}/revoke`,
        {
          method: "POST",
        },
      ),
    );
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toEqual({ changed: false });
    expect(await app.apiKeys.authenticate(created.secret)).toBeNull();
    const auditAfter = await app.database.query<{ count: string }>(
      `select count(*)::text count from kernel.audit_records where subject_type='api_key'`,
    );
    expect(auditAfter.rows[0].count).toBe("2");

    // The credential's stored scope remains metadata, but current target
    // capability resolution is still required on the next request.
    const targetKey = await app.apiKeys.create({
      accountId: target.id,
      name: "target catalogue key",
      scopes: ["catalogue:manage"],
      createdBy: actor.id,
    });
    const beforeRevoke = await createApiApp(app as any).fetch(
      new Request("http://localhost/api/operator/listings", {
        headers: { authorization: `Bearer ${targetKey.secret}` },
      }),
    );
    // The empty development catalogue may make the legacy handler reject its
    // request shape, but authorization must have passed before the capability
    // is revoked.
    expect(beforeRevoke.status).not.toBe(403);
    await app.capabilityAdministration.revoke(actor.id, target.id, "catalogue.manage");
    const afterRevoke = await createApiApp(app as any).fetch(
      new Request("http://localhost/api/operator/listings", {
        headers: { authorization: `Bearer ${targetKey.secret}` },
      }),
    );
    expect(afterRevoke.status).toBe(403);
  });

  it("contains operator scopes to both actor and target account authority", async () => {
    const actor = await account("scopeoperator");
    const target = await account("scopetarget");
    await grant(actor.id, "api_keys.manage");
    await grant(actor.id, "catalogue.manage");
    await grant(actor.id, "accounts.read");
    await grant(actor.id, "finance.read");
    await grant(target.id, "treasury.manage");
    await grant(target.id, "accounts.read");
    await grant(target.id, "finance.read");
    await grant(target.id, "finance.manage");
    const api = sessionApi(actor.id, [
      "api_keys.manage",
      "catalogue.manage",
      "accounts.read",
      "finance.read",
    ]);
    const denied = await api.fetch(
      new Request(`http://localhost/api/operator/accounts/${target.id}/api-keys`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "treasury", scopes: ["treasury:manage"] }),
      }),
    );
    expect(denied.status).toBe(403);
    expect((await denied.json()).code).toBe("scope_delegation_forbidden");

    const broadDenied = await api.fetch(
      new Request(`http://localhost/api/operator/accounts/${target.id}/api-keys`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "finance", scopes: ["operations:manage"] }),
      }),
    );
    expect(broadDenied.status).toBe(403);
    expect((await broadDenied.json()).code).toBe("scope_delegation_forbidden");

    const root = await account("scoperoot");
    await grant(root.id, "system.root");
    const rootApi = sessionApi(root.id, ["system.root"]);
    const targetDenied = await rootApi.fetch(
      new Request(`http://localhost/api/operator/accounts/${actor.id}/api-keys`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "treasury", scopes: ["treasury:manage"] }),
      }),
    );
    expect(targetDenied.status).toBe(403);
    expect((await targetDenied.json()).code).toBe("target_scope_forbidden");
  });

  it("requires api_keys.manage plus the operator scope for API-key principals", async () => {
    const actor = await account("keyprincipal");
    const target = await account("keyprincipaltarget");
    const scopeOnly = await app.apiKeys.create({
      accountId: actor.id,
      name: "scope only",
      scopes: ["api_keys:manage"],
      createdBy: actor.id,
    });
    const scopeOnlyDenied = await createApiApp(app as any).fetch(
      new Request(`http://localhost/api/operator/accounts/${target.id}/api-keys`, {
        headers: { authorization: `Bearer ${scopeOnly.secret}` },
      }),
    );
    expect(scopeOnlyDenied.status).toBe(403);
    expect((await scopeOnlyDenied.json()).code).toBe("forbidden");
    await grant(actor.id, "api_keys.manage");
    const missingScope = await app.apiKeys.create({
      accountId: actor.id,
      name: "missing scope",
      scopes: [],
      createdBy: actor.id,
    });
    const denied = await createApiApp(app as any).fetch(
      new Request(`http://localhost/api/operator/accounts/${target.id}/api-keys`, {
        method: "GET",
        headers: { authorization: `Bearer ${missingScope.secret}` },
      }),
    );
    expect(denied.status).toBe(403);
    expect((await denied.json()).code).toBe("insufficient_scope");

    const scoped = await app.apiKeys.create({
      accountId: actor.id,
      name: "operator scope",
      scopes: ["api_keys:manage"],
      createdBy: actor.id,
    });
    const allowed = await createApiApp(app as any).fetch(
      new Request(`http://localhost/api/operator/accounts/${target.id}/api-keys`, {
        headers: { authorization: `Bearer ${scoped.secret}` },
      }),
    );
    expect(allowed.status).toBe(200);

    const root = await account("keyroot");
    await grant(root.id, "system.root");
    const rootKey = await app.apiKeys.create({
      accountId: root.id,
      name: "root without scope",
      scopes: [],
      createdBy: root.id,
    });
    const rootDenied = await createApiApp(app as any).fetch(
      new Request(`http://localhost/api/operator/accounts/${target.id}/api-keys`, {
        headers: { authorization: `Bearer ${rootKey.secret}` },
      }),
    );
    expect(rootDenied.status).toBe(403);
    expect((await rootDenied.json()).code).toBe("insufficient_scope");

    const rootScoped = await app.apiKeys.create({
      accountId: root.id,
      name: "root scoped",
      scopes: ["api_keys:manage"],
      createdBy: root.id,
    });
    const rootAllowed = await createApiApp(app as any).fetch(
      new Request(`http://localhost/api/operator/accounts/${target.id}/api-keys`, {
        headers: { authorization: `Bearer ${rootScoped.secret}` },
      }),
    );
    expect(rootAllowed.status).toBe(200);
  });

  it("enforces target ownership and converges concurrent revocation", async () => {
    const actor = await account("ownershipoperator");
    const target = await account("ownershiptarget");
    const foreignTarget = await account("ownershipforeign");
    await grant(actor.id, "api_keys.manage");
    const api = sessionApi(actor.id, ["api_keys.manage"]);
    const createdResponse = await api.fetch(
      new Request(`http://localhost/api/operator/accounts/${target.id}/api-keys`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "ownership", scopes: [] }),
      }),
    );
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();

    const wrongTarget = await api.fetch(
      new Request(
        `http://localhost/api/operator/accounts/${foreignTarget.id}/api-keys/${created.id}/revoke`,
        { method: "POST" },
      ),
    );
    expect(wrongTarget.status).toBe(404);
    expect(await app.apiKeys.authenticate(created.secret)).not.toBeNull();

    const revokeUrl = `http://localhost/api/operator/accounts/${target.id}/api-keys/${created.id}/revoke`;
    const results = await Promise.all([
      api.fetch(new Request(revokeUrl, { method: "POST" })),
      api.fetch(new Request(revokeUrl, { method: "POST" })),
    ]);
    expect(results.map((response) => response.status)).toEqual([200, 200]);
    const changed = await Promise.all(
      results.map(async (response) => (await response.json()).changed),
    );
    expect(changed.sort()).toEqual([false, true]);
    expect(await app.apiKeys.authenticate(created.secret)).toBeNull();
    const audits = await app.database.query<{ count: string }>(
      `select count(*)::text count from kernel.audit_records where subject_type='api_key' and subject_id=$1`,
      [created.id],
    );
    expect(audits.rows[0].count).toBe("2");
  });
});
