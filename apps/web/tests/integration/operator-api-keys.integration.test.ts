import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApiApp } from "@/api/hono";
import { InternalApiKeyManagementRoutes } from "@/api/internal/api-keys/handler";
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
    return internalApi({
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
  function internalApi(container: any) {
    const routes = new InternalApiKeyManagementRoutes(container);
    return {
      fetch(request: Request) {
        const url = new URL(request.url);
        if (
          ["POST", "PATCH", "DELETE"].includes(request.method) &&
          !request.headers.has("origin")
        ) {
          const headers = new Headers(request.headers);
          headers.set("origin", url.origin);
          request = new Request(request, { headers });
        }
        if (url.pathname === "/internal/api-keys") {
          if (request.method === "GET") return routes.collection(request);
          if (request.method === "POST") return routes.create(request);
        }
        const match = /^\/internal\/api-keys\/([^/]+)$/.exec(url.pathname);
        if (match) return routes.item(request, decodeURIComponent(match[1]));
        return Promise.resolve(Response.json({ error: "Not found" }, { status: 404 }));
      },
    };
  }

  it("sorts target keys by normalized name and expiry with no-expiry keys last", async () => {
    const actor = await account("keysortoperator");
    const target = await account("keysorttarget");
    await grant(actor.id, "api_keys.manage");
    await app.database.query(
      `insert into identity_capability.api_keys(name,key_prefix,secret_hash,scopes,expires_at,account_id)
       select seed.name,seed.prefix,decode(repeat('00',31)||seed.hash_suffix,'hex'),'[]'::jsonb,seed.expiry,(select id from identity_capability.accounts where uuid=$1)
       from (values ('Zulu','key_sort_zulu','01',now()+interval '2 days'),('Alpha','key_sort_alpha','02',now()+interval '1 day'),('Never expires','key_sort_never','03',null::timestamptz)) as seed(name,prefix,hash_suffix,expiry)`,
      [target.id],
    );
    const api = sessionApi(actor.id, ["api_keys.manage"]);
    const byName = await api.fetch(
      new Request(
        `http://localhost/internal/api-keys?account_id=${target.id}&sort=name&direction=asc`,
      ),
    );
    expect(byName.status).toBe(200);
    const nameItems = (await byName.json()).items;
    expect(nameItems.map((item: { name: string }) => item.name)).toEqual([
      "Alpha",
      "Never expires",
      "Zulu",
    ]);
    const byExpiry = await api.fetch(
      new Request(
        `http://localhost/internal/api-keys?account_id=${target.id}&sort=expires&direction=asc`,
      ),
    );
    expect((await byExpiry.json()).items.map((item: { name: string }) => item.name)).toEqual([
      "Alpha",
      "Zulu",
      "Never expires",
    ]);
    const invalid = await api.fetch(
      new Request(`http://localhost/internal/api-keys?account_id=${target.id}&sort=unknown`),
    );
    expect(invalid.status).toBe(400);
  });

  it("creates safe target-scoped credentials, audits changes, and revokes idempotently", async () => {
    const actor = await account("keyoperator");
    const target = await account("keytarget");
    await grant(actor.id, "api_keys.manage");
    await grant(actor.id, "catalogue.manage");
    await grant(actor.id, "capabilities.manage");
    await grant(target.id, "catalogue.manage");
    const api = sessionApi(actor.id, ["api_keys.manage", "catalogue.manage"]);

    const createdResponse = await api.fetch(
      new Request(`http://localhost/internal/api-keys`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account_id: target.id,
          name: "catalogue automation",
          scopes: ["catalogue:manage"],
        }),
      }),
    );
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    expect(created.secret).toMatch(/^cliq_live_/);
    expect(created.key_prefix).toBeUndefined();

    const listed = await api.fetch(
      new Request(`http://localhost/internal/api-keys?account_id=${target.id}`),
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
      new Request(`http://localhost/internal/api-keys/${created.id}`, {
        method: "DELETE",
      }),
    );
    expect(revoked.status).toBe(204);
    const repeated = await api.fetch(
      new Request(`http://localhost/internal/api-keys/${created.id}`, {
        method: "DELETE",
      }),
    );
    expect(repeated.status).toBe(204);
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
      new Request("http://localhost/api/listings?state=all", {
        headers: { authorization: `Bearer ${targetKey.secret}` },
      }),
    );
    expect(beforeRevoke.status, await beforeRevoke.clone().text()).toBe(200);
    await app.capabilityAdministration.revoke(actor.id, target.id, "catalogue.manage");
    const afterRevoke = await createApiApp(app as any).fetch(
      new Request("http://localhost/api/listings?state=all", {
        headers: { authorization: `Bearer ${targetKey.secret}` },
      }),
    );
    expect(afterRevoke.status).toBe(403);
  });

  it("provides a canonical cross-account CRUD collection without exposing secrets after creation", async () => {
    const actor = await account("crudkeyoperator");
    const first = await account("crudkeyfirst");
    const second = await account("crudkeysecond");
    await grant(actor.id, "api_keys.manage");
    const existing = await app.apiKeys.create({
      accountId: second.id,
      name: "Second account automation",
      scopes: [],
      createdBy: actor.id,
    });
    const api = sessionApi(actor.id, ["api_keys.manage"]);
    const createdResponse = await api.fetch(
      new Request("http://localhost/internal/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account_id: first.id,
          name: "First account automation",
          scopes: [],
        }),
      }),
    );
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    expect(created.secret).toMatch(/^cliq_live_/);

    const list = await api.fetch(
      new Request("http://localhost/internal/api-keys?sort=name&direction=asc"),
    );
    expect(list.status).toBe(200);
    const listed = await list.json();
    expect(listed.items.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([created.id, existing.id]),
    );
    expect(listed.items.find((item: { id: string }) => item.id === created.id)).toMatchObject({
      account_username: "crudkeyfirst",
      account_email: "crudkeyfirst@example.com",
      name: "First account automation",
      state: "active",
    });
    for (const item of listed.items) {
      expect(item.secret).toBeUndefined();
      expect(item.key_prefix).toBeUndefined();
    }

    const searched = await api.fetch(
      new Request("http://localhost/internal/api-keys?search=Second+account"),
    );
    expect((await searched.json()).items.map((item: { id: string }) => item.id)).toEqual([
      existing.id,
    ]);
    const detail = await api.fetch(new Request(`http://localhost/internal/api-keys/${created.id}`));
    expect(detail.status).toBe(200);
    expect((await detail.json()).item.secret).toBeUndefined();

    const updated = await api.fetch(
      new Request(`http://localhost/internal/api-keys/${created.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Renamed automation",
          scopes: [],
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      }),
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).item).toMatchObject({
      name: "Renamed automation",
      account_id: first.id,
      state: "active",
    });

    const ownerChange = await api.fetch(
      new Request(`http://localhost/internal/api-keys/${created.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account_id: second.id, name: "No reassignment", scopes: [] }),
      }),
    );
    expect(ownerChange.status).toBe(400);
    expect((await app.apiKeys.authenticate(created.secret))?.accountId).toBe(first.id);

    const deleted = await api.fetch(
      new Request(`http://localhost/internal/api-keys/${created.id}`, { method: "DELETE" }),
    );
    expect(deleted.status).toBe(204);
    expect(await app.apiKeys.authenticate(created.secret)).toBeNull();
    const deletedMetadata = await api.fetch(
      new Request("http://localhost/internal/api-keys?account_id=" + first.id + "&state=deleted"),
    );
    expect((await deletedMetadata.json()).items.map((item: { id: string }) => item.id)).toContain(
      created.id,
    );
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
      new Request(`http://localhost/internal/api-keys`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account_id: target.id,
          name: "treasury",
          scopes: ["treasury:manage"],
        }),
      }),
    );
    expect(denied.status).toBe(403);
    expect((await denied.json()).code).toBe("scope_delegation_forbidden");

    const broadDenied = await api.fetch(
      new Request(`http://localhost/internal/api-keys`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account_id: target.id,
          name: "finance",
          scopes: ["operations:manage"],
        }),
      }),
    );
    expect(broadDenied.status).toBe(403);
    expect((await broadDenied.json()).code).toBe("scope_delegation_forbidden");

    const root = await account("scoperoot");
    await grant(root.id, "system.root");
    const rootApi = sessionApi(root.id, ["system.root"]);
    const targetDenied = await rootApi.fetch(
      new Request(`http://localhost/internal/api-keys`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account_id: actor.id,
          name: "treasury",
          scopes: ["treasury:manage"],
        }),
      }),
    );
    expect(targetDenied.status).toBe(403);
    expect((await targetDenied.json()).code).toBe("target_scope_forbidden");
  });

  it("keeps self-management eligibility separate and derives ownership from the session", async () => {
    const owner = await account("selfkeyowner");
    const other = await account("selfkeyother");
    const ordinary = sessionApi(owner.id, []);
    expect((await ordinary.fetch(new Request("http://localhost/internal/api-keys"))).status).toBe(
      403,
    );

    await grant(owner.id, "api_keys.self_manage");
    const self = sessionApi(owner.id, ["api_keys.self_manage"]);
    const createdResponse = await self.fetch(
      new Request("http://localhost/internal/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "own integration", scopes: [] }),
      }),
    );
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    expect(created.account_id).toBe(owner.id);
    expect((await app.apiKeys.authenticate(created.secret))?.accountId).toBe(owner.id);

    const crossAccountCreate = await self.fetch(
      new Request("http://localhost/internal/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account_id: other.id, name: "not mine", scopes: [] }),
      }),
    );
    expect(crossAccountCreate.status).toBe(404);

    const foreignKey = await app.apiKeys.create({
      accountId: other.id,
      name: "other account key",
      scopes: [],
      createdBy: other.id,
    });
    expect(
      (await self.fetch(new Request(`http://localhost/internal/api-keys/${foreignKey.id}`))).status,
    ).toBe(404);

    const ownKey = await self.fetch(
      new Request(`http://localhost/internal/api-keys/${created.id}`),
    );
    expect(ownKey.status).toBe(200);
    expect((await ownKey.json()).item.secret).toBeUndefined();
    const updated = await self.fetch(
      new Request(`http://localhost/internal/api-keys/${created.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "renamed own integration", scopes: [] }),
      }),
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).item.name).toBe("renamed own integration");
    const deleted = await self.fetch(
      new Request(`http://localhost/internal/api-keys/${created.id}`, { method: "DELETE" }),
    );
    expect(deleted.status).toBe(204);
    expect(await app.apiKeys.authenticate(created.secret)).toBeNull();
  });

  it("rejects every API-key credential at the internal session-only boundary", async () => {
    const actor = await account("keyprincipal");
    const scopeOnly = await app.apiKeys.create({
      accountId: actor.id,
      name: "scope only",
      scopes: ["catalogue:read"],
      createdBy: actor.id,
    });
    const internal = internalApi(app as any);
    const scopeOnlyDenied = await internal.fetch(
      new Request("http://localhost/internal/api-keys", {
        headers: { authorization: `Bearer ${scopeOnly.secret}` },
      }),
    );
    expect(scopeOnlyDenied.status).toBe(401);
    await grant(actor.id, "api_keys.manage");
    const missingScope = await app.apiKeys.create({
      accountId: actor.id,
      name: "missing scope",
      scopes: [],
      createdBy: actor.id,
    });
    const denied = await internal.fetch(
      new Request("http://localhost/internal/api-keys", {
        method: "GET",
        headers: { authorization: `Bearer ${missingScope.secret}` },
      }),
    );
    expect(denied.status).toBe(401);

    const scoped = await app.apiKeys.create({
      accountId: actor.id,
      name: "operator scope",
      scopes: ["operations:manage"],
      createdBy: actor.id,
    });
    const allowed = await internal.fetch(
      new Request("http://localhost/internal/api-keys", {
        headers: { authorization: `Bearer ${scoped.secret}` },
      }),
    );
    expect(allowed.status).toBe(401);

    const root = await account("keyroot");
    await grant(root.id, "system.root");
    const rootKey = await app.apiKeys.create({
      accountId: root.id,
      name: "root without scope",
      scopes: [],
      createdBy: root.id,
    });
    const rootDenied = await internal.fetch(
      new Request("http://localhost/internal/api-keys", {
        headers: { authorization: `Bearer ${rootKey.secret}` },
      }),
    );
    expect(rootDenied.status).toBe(401);

    const rootScoped = await app.apiKeys.create({
      accountId: root.id,
      name: "root scoped",
      scopes: ["operations:manage"],
      createdBy: root.id,
    });
    const rootAllowed = await internal.fetch(
      new Request("http://localhost/internal/api-keys", {
        headers: { authorization: `Bearer ${rootScoped.secret}` },
      }),
    );
    expect(rootAllowed.status).toBe(401);
  });

  it("enforces target ownership and converges concurrent revocation", async () => {
    const actor = await account("ownershipoperator");
    const target = await account("ownershiptarget");
    await account("ownershipforeign");
    await grant(actor.id, "api_keys.manage");
    const api = sessionApi(actor.id, ["api_keys.manage"]);
    const createdResponse = await api.fetch(
      new Request("http://localhost/internal/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account_id: target.id, name: "ownership", scopes: [] }),
      }),
    );
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();

    const revokeUrl = `http://localhost/internal/api-keys/${created.id}`;
    const results = await Promise.all([
      api.fetch(new Request(revokeUrl, { method: "DELETE" })),
      api.fetch(new Request(revokeUrl, { method: "DELETE" })),
    ]);
    expect(results.map((response) => response.status)).toEqual([204, 204]);
    expect(await app.apiKeys.authenticate(created.secret)).toBeNull();
    const audits = await app.database.query<{ count: string }>(
      `select count(*)::text count from kernel.audit_records where subject_type='api_key' and subject_id=$1`,
      [created.id],
    );
    expect(audits.rows[0].count).toBe("2");
  });
});
