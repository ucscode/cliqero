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
          headers.set("host", url.host);
          headers.set("origin", url.origin);
          request = new Request(request, { headers });
        } else if (!request.headers.has("host")) {
          const headers = new Headers(request.headers);
          headers.set("host", url.host);
          request = new Request(request, { headers });
        }
        if (url.pathname.endsWith("/secret") && !request.headers.has("origin")) {
          const headers = new Headers(request.headers);
          headers.set("origin", url.origin);
          request = new Request(request, { headers });
        }
        if (url.pathname === "/internal/api-keys") {
          if (request.method === "GET") return routes.collection(request);
          if (request.method === "POST") return routes.create(request);
        }
        if (url.pathname === "/internal/api-keys/actions/delete" && request.method === "POST")
          return routes.bulkDelete(request);
        const reassignMatch = /^\/internal\/api-keys\/([^/]+)\/reassign$/.exec(url.pathname);
        if (reassignMatch && request.method === "POST")
          return routes.reassign(request, decodeURIComponent(reassignMatch[1]));
        const secretMatch = /^\/internal\/api-keys\/([^/]+)\/secret$/.exec(url.pathname);
        if (secretMatch && request.method === "GET")
          return routes.secret(request, decodeURIComponent(secretMatch[1]));
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

  it("lets a system-root session load target scopes and create a permitted key while bearer keys stay excluded", async () => {
    const root = await account("rootkeycontext");
    const target = await account("centralkeytarget");
    await grant(root.id, "system.root");
    await grant(target.id, "catalogue.manage");

    const rootSession = sessionApi(root.id, ["system.root"]);
    const context = await rootSession.fetch(
      new Request(`http://localhost/internal/api-keys?account_id=${target.id}`),
    );
    expect(context.status).toBe(200);
    const permissions = await context.json();
    expect(permissions.manageable_scopes).toContain("catalogue:manage");

    const created = await rootSession.fetch(
      new Request("http://localhost/internal/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account_id: target.id,
          name: "central catalogue access",
          state: "active",
          scopes: ["catalogue:manage"],
          expires_at: null,
        }),
      }),
    );
    expect(created.status).toBe(201);
    const key = await created.json();
    expect(key.secret).toMatch(/^cliq_live_/);
    const authenticatedKey = await app.apiKeys.authenticate(key.secret);
    expect(authenticatedKey).not.toBeNull();
    expect(authenticatedKey?.accountId).toBe(target.id);

    const bearer = await internalApi(app as any).fetch(
      new Request("http://localhost/internal/api-keys", {
        headers: { authorization: `Bearer ${key.secret}` },
      }),
    );
    expect(bearer.status).toBe(401);
  });

  it("creates a key through Better Auth's real session-to-canonical-account authorization path", async () => {
    const root = await account("realrootkeyoperator");
    await grant(root.id, "system.root");
    const login = await app.authentication.auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "realrootkeyoperator@example.com",
          password: "correct-horse-battery",
        }),
      }),
    );
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toContain("better-auth");
    const routes = new InternalApiKeyManagementRoutes(app);
    const created = await routes.create(
      new Request("http://localhost:3000/internal/api-keys", {
        method: "POST",
        headers: {
          cookie: cookie!,
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          account_id: root.id,
          name: "real-session-test-key",
          scopes: [],
          expires_at: null,
          state: "active",
        }),
      }),
    );
    expect(created.status).toBe(201);
    const key = await created.json();
    expect(await app.apiKeys.authenticate(key.secret)).toMatchObject({ accountId: root.id });
    const revealed = await routes.secret(
      new Request(`http://localhost:3000/internal/api-keys/${key.id}/secret`, {
        headers: {
          cookie: cookie!,
          host: "localhost:3000",
          origin: "http://localhost:3000",
        },
      }),
      key.id,
    );
    expect(revealed.status).toBe(200);
    expect(await revealed.json()).toEqual({ secret: key.secret, legacy: false });
    const bearer = await routes.collection(
      new Request("http://localhost:3000/internal/api-keys", {
        headers: { authorization: `Bearer ${key.secret}` },
      }),
    );
    expect(bearer.status).toBe(401);

    const ordinary = await account("realordinarykeyoperator");
    const ordinaryLogin = await app.authentication.auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "realordinarykeyoperator@example.com",
          password: "correct-horse-battery",
        }),
      }),
    );
    const ordinaryCookie = ordinaryLogin.headers.get("set-cookie")?.split(";")[0];
    expect(ordinaryLogin.status).toBe(200);
    const ordinaryDenied = await routes.create(
      new Request("http://localhost:3000/internal/api-keys", {
        method: "POST",
        headers: {
          cookie: ordinaryCookie!,
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "ordinary-cannot-manage",
          scopes: [],
          state: "active",
        }),
      }),
    );
    expect(ordinaryDenied.status).toBe(403);
    expect(ordinary.id).not.toBe(root.id);
    const deleted = await routes.item(
      new Request(`http://localhost:3000/internal/api-keys/${key.id}`, {
        method: "DELETE",
        headers: {
          cookie: cookie!,
          host: "localhost:3000",
          origin: "http://localhost:3000",
        },
      }),
      key.id,
    );
    expect(deleted.status).toBe(204);
  });

  it("creates safe target-scoped credentials, audits changes, and revokes without deleting", async () => {
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
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "revoked" }),
      }),
    );
    expect(revoked.status).toBe(200);
    expect((await revoked.json()).item.state).toBe("revoked");
    const stillListed = await api.fetch(
      new Request(`http://localhost/internal/api-keys?account_id=${target.id}&state=revoked`),
    );
    expect((await stillListed.json()).items.map((item: { id: string }) => item.id)).toContain(
      created.id,
    );
    const repeated = await api.fetch(
      new Request(`http://localhost/internal/api-keys/${created.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "revoked" }),
      }),
    );
    expect(repeated.status).toBe(200);
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

  it("creates a revoked credential without ever making it authenticatable", async () => {
    const actor = await account("revokedcreateoperator");
    const target = await account("revokedcreatetarget");
    await grant(actor.id, "api_keys.manage");
    const api = sessionApi(actor.id, ["api_keys.manage"]);
    const response = await api.fetch(
      new Request("http://localhost/internal/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account_id: target.id,
          name: "pre-revoked key",
          scopes: [],
          state: "revoked",
        }),
      }),
    );
    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created.state).toBe("revoked");
    expect(await app.apiKeys.authenticate(created.secret)).toBeNull();
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
    expect(await app.apiKeys.delete(created.id, second.id)).toBe(false);
    expect((await app.apiKeys.authenticate(created.secret))?.accountId).toBe(first.id);

    const deleted = await api.fetch(
      new Request(`http://localhost/internal/api-keys/${created.id}`, { method: "DELETE" }),
    );
    expect(deleted.status).toBe(204);
    expect(await app.apiKeys.authenticate(created.secret)).toBeNull();
    const deletedMetadata = await api.fetch(
      new Request(`http://localhost/internal/api-keys?account_id=${first.id}&state=all`),
    );
    expect(
      (await deletedMetadata.json()).items.map((item: { id: string }) => item.id),
    ).not.toContain(created.id);
  });

  it("authenticates by hash when recovery data is unavailable and reports legacy keys without secrets", async () => {
    const owner = await account("hashonlykeyowner");
    await grant(owner.id, "api_keys.manage");
    const key = await app.apiKeys.create({
      accountId: owner.id,
      name: "Hash-only compatibility",
      scopes: [],
      createdBy: owner.id,
    });
    await app.database.query(
      `update identity_capability.api_keys set secret_ciphertext=null,secret_nonce=null,secret_auth_tag=null,secret_key_version=null where uuid=$1`,
      [key.id],
    );

    expect(await app.apiKeys.authenticate(key.secret)).toMatchObject({ accountId: owner.id });
    expect(await app.apiKeys.reveal(key.id)).toBeNull();
    const legacy = await sessionApi(owner.id, ["api_keys.manage"]).fetch(
      new Request(`http://localhost/internal/api-keys/${key.id}/secret`),
    );
    expect(legacy.status).toBe(200);
    expect(await legacy.json()).toEqual({ secret: null, legacy: true });

    const damaged = await app.apiKeys.create({
      accountId: owner.id,
      name: "Damaged recovery copy",
      scopes: [],
      createdBy: owner.id,
    });
    await app.database.query(
      `update identity_capability.api_keys set secret_ciphertext=decode('00','hex') where uuid=$1`,
      [damaged.id],
    );
    expect(await app.apiKeys.authenticate(damaged.secret)).toMatchObject({ accountId: owner.id });
    await expect(app.apiKeys.reveal(damaged.id)).rejects.toMatchObject({
      code: "secret_unavailable",
    });
  });

  it("bulk-deletes server-side with independent per-key authorization and partial outcomes", async () => {
    const actor = await account("bulkkeyoperator");
    const allowedTarget = await account("bulkkeytarget");
    const restrictedTarget = await account("bulkkeyrestricted");
    await grant(actor.id, "api_keys.manage");
    await grant(restrictedTarget.id, "catalogue.manage");

    const allowed = await app.apiKeys.create({
      accountId: allowedTarget.id,
      name: "bulk allowed",
      scopes: [],
      createdBy: actor.id,
    });
    const restricted = await app.apiKeys.create({
      accountId: restrictedTarget.id,
      name: "bulk restricted scope",
      scopes: ["catalogue:manage"],
      createdBy: actor.id,
    });
    const previouslyRevoked = await app.apiKeys.create({
      accountId: allowedTarget.id,
      name: "already revoked",
      scopes: [],
      createdBy: actor.id,
    });
    await app.apiKeys.update(previouslyRevoked.id, {
      name: previouslyRevoked.name,
      scopes: previouslyRevoked.scopes,
      expiresAt: previouslyRevoked.expiresAt,
      status: "revoked",
    });

    const api = sessionApi(actor.id, ["api_keys.manage"]);
    const response = await api.fetch(
      new Request("http://localhost/internal/api-keys/actions/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [allowed.id, restricted.id, previouslyRevoked.id] }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      succeeded: [allowed.id, previouslyRevoked.id],
      failed: [
        {
          id: restricted.id,
          message: expect.stringContaining("cannot assign the catalogue:manage scope"),
        },
      ],
    });
    expect(await app.apiKeys.authenticate(allowed.secret)).toBeNull();
    expect(await app.apiKeys.authenticate(previouslyRevoked.secret)).toBeNull();
    expect(await app.apiKeys.authenticate(restricted.secret)).not.toBeNull();
  });

  it("restricts owner transfer to root, rotates credentials, validates destination scopes, and reactivates revoked keys only for root", async () => {
    const ordinaryOperator = await account("transferoperator");
    const source = await account("transfersource");
    const destination = await account("transferdestination");
    const restrictedDestination = await account("transferrestricted");
    await grant(ordinaryOperator.id, "api_keys.manage");
    await grant(source.id, "catalogue.manage");
    await grant(destination.id, "catalogue.manage");
    await grant(restrictedDestination.id, "api_keys.manage");
    const key = await app.apiKeys.create({
      accountId: source.id,
      name: "transferable credential",
      scopes: ["catalogue:manage"],
      createdBy: ordinaryOperator.id,
    });
    const deniedApi = sessionApi(ordinaryOperator.id, ["api_keys.manage"]);
    const transferBody = {
      account_id: destination.id,
      name: "transferred credential",
      scopes: ["catalogue:manage"],
      expires_at: null,
      state: "active",
    };
    const denied = await deniedApi.fetch(
      new Request(`http://localhost/internal/api-keys/${key.id}/reassign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(transferBody),
      }),
    );
    expect(denied.status).toBe(403);
    expect(await app.apiKeys.authenticate(key.secret)).not.toBeNull();

    const root = await account("transferroot");
    await grant(root.id, "system.root");
    const rootApi = sessionApi(root.id, ["system.root"]);
    const invalidScopes = await rootApi.fetch(
      new Request(`http://localhost/internal/api-keys/${key.id}/reassign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...transferBody, account_id: restrictedDestination.id }),
      }),
    );
    expect(invalidScopes.status).toBe(403);
    expect((await invalidScopes.json()).code).toBe("target_scope_forbidden");

    const movedResponse = await rootApi.fetch(
      new Request(`http://localhost/internal/api-keys/${key.id}/reassign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(transferBody),
      }),
    );
    expect(movedResponse.status).toBe(200);
    const moved = await movedResponse.json();
    expect(moved.secret).toMatch(/^cliq_live_/);
    expect(moved.secret).not.toBe(key.secret);
    expect(moved.account_id).toBe(destination.id);
    expect(await app.apiKeys.authenticate(key.secret)).toBeNull();
    expect((await app.apiKeys.authenticate(moved.secret))?.accountId).toBe(destination.id);

    const revokedTransfer = await rootApi.fetch(
      new Request(`http://localhost/internal/api-keys/${key.id}/reassign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...transferBody, account_id: source.id, state: "revoked" }),
      }),
    );
    expect(revokedTransfer.status).toBe(200);
    const revokedReplacement = await revokedTransfer.json();
    expect(revokedReplacement.state).toBe("revoked");
    expect(await app.apiKeys.authenticate(revokedReplacement.secret)).toBeNull();

    const activeTransfer = await rootApi.fetch(
      new Request(`http://localhost/internal/api-keys/${key.id}/reassign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...transferBody, account_id: destination.id, state: "active" }),
      }),
    );
    expect(activeTransfer.status).toBe(200);
    const activeReplacement = await activeTransfer.json();
    expect(activeReplacement.state).toBe("active");
    expect((await app.apiKeys.authenticate(activeReplacement.secret))?.accountId).toBe(
      destination.id,
    );
    const reassignmentAudit = await app.database.query<{
      action: string;
      previous_state: any;
      new_state: any;
    }>(
      `select action,previous_state,new_state from kernel.audit_records where subject_type='api_key' and subject_id=$1 order by id desc limit 1`,
      [key.id],
    );
    expect(reassignmentAudit.rows[0].action).toBe("api_key.reassigned");
    expect(JSON.stringify(reassignmentAudit.rows[0])).not.toContain(moved.secret);

    const revoke = await rootApi.fetch(
      new Request(`http://localhost/internal/api-keys/${key.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "revoked" }),
      }),
    );
    expect(revoke.status).toBe(200);
    expect(await app.apiKeys.authenticate(moved.secret)).toBeNull();
    const ordinaryReactivate = await deniedApi.fetch(
      new Request(`http://localhost/internal/api-keys/${key.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "active" }),
      }),
    );
    expect(ordinaryReactivate.status).toBe(403);
    const rootReactivate = await rootApi.fetch(
      new Request(`http://localhost/internal/api-keys/${key.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "active" }),
      }),
    );
    expect(rootReactivate.status).toBe(200);
    expect((await app.apiKeys.authenticate(activeReplacement.secret))?.accountId).toBe(
      destination.id,
    );

    const deleteResponse = await rootApi.fetch(
      new Request(`http://localhost/internal/api-keys/${key.id}`, { method: "DELETE" }),
    );
    expect(deleteResponse.status).toBe(204);
    expect(await app.apiKeys.authenticate(activeReplacement.secret)).toBeNull();
    const keyRows = await app.database.query<{ count: string }>(
      `select count(*)::text count from identity_capability.api_keys where uuid=$1`,
      [key.id],
    );
    expect(keyRows.rows[0].count).toBe("0");
  });

  it("paginates the collection deterministically within the applied filters", async () => {
    const actor = await account("pagekeyoperator");
    const target = await account("pagekeytarget");
    await grant(actor.id, "api_keys.manage");
    const ids = [];
    for (const name of ["Page Alpha", "Page Beta", "Page Gamma"]) {
      ids.push(
        (
          await app.apiKeys.create({
            accountId: target.id,
            name,
            scopes: [],
            createdBy: actor.id,
          })
        ).id,
      );
    }
    const api = sessionApi(actor.id, ["api_keys.manage"]);
    const pageOne = await api.fetch(
      new Request(
        `http://localhost/internal/api-keys?account_id=${target.id}&search=Page&sort=name&direction=asc&limit=1`,
      ),
    );
    const first = await pageOne.json();
    const pageTwo = await api.fetch(
      new Request(
        `http://localhost/internal/api-keys?account_id=${target.id}&search=Page&sort=name&direction=asc&limit=1&cursor=${first.next_cursor}`,
      ),
    );
    const second = await pageTwo.json();
    const pageThree = await api.fetch(
      new Request(
        `http://localhost/internal/api-keys?account_id=${target.id}&search=Page&sort=name&direction=asc&limit=1&cursor=${second.next_cursor}`,
      ),
    );
    const third = await pageThree.json();
    const pagedIds = [first.items[0].id, second.items[0].id, third.items[0].id];
    expect(new Set(pagedIds).size).toBe(3);
    expect(pagedIds).toEqual(ids);
    expect(third.next_cursor).toBeNull();
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
    const revokeRequest = () =>
      api.fetch(
        new Request(revokeUrl, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state: "revoked" }),
        }),
      );
    const results = await Promise.all([revokeRequest(), revokeRequest()]);
    expect(results.map((response) => response.status)).toEqual([200, 200]);
    expect(await app.apiKeys.authenticate(created.secret)).toBeNull();
    const audits = await app.database.query<{ count: string }>(
      `select count(*)::text count from kernel.audit_records where subject_type='api_key' and subject_id=$1`,
      [created.id],
    );
    expect(audits.rows[0].count).toBe("2");
  });
});
