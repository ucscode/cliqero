import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";
import { createApiApp } from "@/api/hono";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite("headless API principal and hierarchy read model", () => {
  const app = createContainer(databaseUrl!);
  let n = 0;
  beforeEach(() =>
    app.database.query(
      `truncate table identity_capability.api_keys,referral_capability.account_referrals,identity_capability.account_capabilities,identity_capability.auth_account_links,better_auth."session",better_auth.account,better_auth.verification,better_auth."user",identity_capability.accounts restart identity cascade`,
    ),
  );
  afterAll(() => app.database.close());
  async function account(prefix: string) {
    n++;
    return app.authentication.register({
      email: `${prefix}${n}@example.com`,
      handle: `${prefix}${n}`,
      password: "correct-horse-battery",
      country: "NG",
    });
  }
  it("creates hashed API keys and resolves the same Cliqero account", async () => {
    const owner = await account("key");
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability) values($1,'operator')`,
      [owner.id],
    );
    const created = await app.apiKeys.create({
      accountId: owner.id,
      name: "automation",
      scopes: ["hierarchy:read"],
      createdBy: owner.id,
    });
    expect(created.secret).toMatch(/^cliq_live_/);
    expect((await app.apiKeys.authenticate(created.secret))?.accountId).toBe(owner.id);
    expect(
      (
        await app.database.query(
          `select last_used_at from identity_capability.api_keys where id=$1`,
          [created.id],
        )
      ).rows[0].last_used_at,
    ).not.toBeNull();
    const row = await app.database.query<{ secret_hash: Buffer }>(
      `select secret_hash from identity_capability.api_keys where id=$1`,
      [created.id],
    );
    expect(row.rows[0].secret_hash.toString()).not.toContain(created.secret);
    expect(await app.apiKeys.authenticate("cliq_live_invalid")).toBeNull();
    expect(
      (
        await app.principalResolver.resolve(
          new Request("http://localhost", {
            headers: { authorization: `Bearer ${created.secret}` },
          }),
        )
      )?.kind,
    ).toBe("api_key");
    await app.apiKeys.revoke(created.id);
    expect(await app.apiKeys.authenticate(created.secret)).toBeNull();
    const expired = await app.apiKeys.create({
      accountId: owner.id,
      name: "expired",
      scopes: [],
      createdBy: owner.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await app.apiKeys.authenticate(expired.secret)).toBeNull();
    await expect(
      app.apiKeys.create({
        accountId: owner.id,
        name: "bad",
        scopes: ["hierachy:read"],
        createdBy: owner.id,
      }),
    ).rejects.toThrow("Unknown API key scope");
  });
  it("manages personal API keys only for the authenticated account", async () => {
    const owner = await account("personal"),
      other = await account("otherkey");
    const api = createApiApp({
      ...app,
      principalResolver: {
        resolve: async () => ({
          accountId: owner.id,
          account: owner,
          kind: "user_session",
          roles: [],
          scopes: new Set<string>(),
        }),
      },
    } as any);
    const createdResponse = await api.fetch(
      new Request("http://localhost/api/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "personal automation",
          scopes: ["wallet:read"],
        }),
      }),
    );
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    expect(created.secret).toMatch(/^cliq_live_/);
    const listed = await api.fetch(new Request("http://localhost/api/api-keys"));
    expect(listed.status).toBe(200);
    expect((await listed.json()).items).toHaveLength(1);
    const foreign = await app.apiKeys.create({
      accountId: other.id,
      name: "foreign",
      scopes: [],
      createdBy: other.id,
    });
    const foreignRevoke = await api.fetch(
      new Request(`http://localhost/api/api-keys/${foreign.id}/revoke`, { method: "POST" }),
    );
    expect(foreignRevoke.status).toBe(404);
    const revoked = await api.fetch(
      new Request(`http://localhost/api/api-keys/${created.id}/revoke`, { method: "POST" }),
    );
    expect(revoked.status).toBe(204);
  });
  it("returns role-scoped operator overview data through Hono", async () => {
    const catalogueManager = await account("cataloguemanager"),
      operator = await account("overviewoperator"),
      ordinary = await account("overviewordinary");
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability) values($1,'catalogue_manager'),($2,'operator')`,
      [catalogueManager.id, operator.id],
    );
    const forPrincipal = (accountId: string, roles: string[]) =>
      createApiApp({
        ...app,
        principalResolver: {
          resolve: async () => ({
            accountId,
            account: roles.includes("operator") ? operator : catalogueManager,
            kind: "user_session" as const,
            roles,
            scopes: new Set<string>(),
          }),
        },
      } as any);
    const catalogueResponse = await forPrincipal(catalogueManager.id, ["catalogue_manager"]).fetch(
      new Request("http://localhost/api/operator/overview"),
    );
    expect(catalogueResponse.status).toBe(200);
    expect((await catalogueResponse.json()).users).toBeUndefined();
    const operatorResponse = await forPrincipal(operator.id, ["operator"]).fetch(
      new Request("http://localhost/api/operator/overview"),
    );
    expect(operatorResponse.status).toBe(200);
    expect((await operatorResponse.json()).users).toEqual({ total: 3 });
    const ordinaryResponse = await forPrincipal(ordinary.id, []).fetch(
      new Request("http://localhost/api/operator/overview"),
    );
    expect(ordinaryResponse.status).toBe(403);
  });
  it("provides a bounded safe operator account projection and detail", async () => {
    const operator = await account("accountoperator");
    const child = await account("accountchild");
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability) values($1,'operator')`,
      [operator.id],
    );
    await app.referralGraphService.establish(child.id, operator.id);
    const api = createApiApp({
      ...app,
      principalResolver: {
        resolve: async () => ({
          accountId: operator.id,
          account: operator,
          kind: "user_session" as const,
          roles: ["operator"],
          scopes: new Set<string>(),
        }),
      },
    } as any);
    const list = await api.fetch(new Request("http://localhost/api/operator/accounts?limit=1"));
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.items).toHaveLength(1);
    expect(listBody.items[0]).toMatchObject({ id: expect.any(String), handle: expect.any(String) });
    expect(listBody.items[0].password_hash).toBeUndefined();
    const detail = await api.fetch(
      new Request(`http://localhost/api/operator/accounts/${child.id}`),
    );
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      id: child.id,
      parent: { id: operator.id },
      roles: [],
    });
    const unrelated = await api.fetch(
      new Request(`http://localhost/api/operator/accounts/${newId()}`),
    );
    expect(unrelated.status).toBe(404);
  });
  it("keeps normalized profile handles unique under concurrent updates", async () => {
    const first = await account("handlefirst"),
      second = await account("handlesecond");
    const results = await Promise.allSettled([
      app.profiles.update(first.id, { handle: "SharedHandle" }),
      app.profiles.update(second.id, { handle: "sharedhandle" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rows = await app.database.query<{ count: string }>(
      `select count(*) count from identity_capability.accounts where handle='sharedhandle'`,
    );
    expect(rows.rows[0].count).toBe("1");
  });
  it("authorizes descendant roots and bounds the visualization window", async () => {
    const upline = await account("upline"),
      root = await account("root"),
      child = await account("child"),
      grand = await account("grand"),
      sibling = await account("sibling"),
      outsider = await account("outside");
    await app.referralGraphService.establish(root.id, upline.id);
    await app.referralGraphService.establish(child.id, root.id);
    await app.referralGraphService.establish(grand.id, child.id);
    await app.referralGraphService.establish(sibling.id, root.id);
    const own = await app.hierarchy.tree(root.id, root.id, false);
    expect(own.nodes.map((n) => n.id)).toContain(grand.id);
    expect(own.parent?.id).toBe(upline.id);
    expect(own.parent?.canNavigate).toBe(false);
    const rebased = await app.hierarchy.tree(root.id, grand.id, false);
    expect(rebased.parent?.id).toBe(child.id);
    expect(rebased.parent?.canNavigate).toBe(true);
    await expect(app.hierarchy.tree(root.id, outsider.id, false)).rejects.toThrow("Forbidden");
    const admin = await account("admin");
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability) values($1,'operator')`,
      [admin.id],
    );
    expect((await app.hierarchy.tree(admin.id, outsider.id, true)).root).toBe(outsider.id);
  });
  it("authorizes descendants beyond thirty-two generations and supports child continuation", async () => {
    const ids = Array.from({ length: 41 }, () => newId());
    for (let i = 0; i < ids.length; i++)
      await app.database.query(
        `insert into identity_capability.accounts(id,email,handle) values($1,$2,$3)`,
        [ids[i], `deep${i}@example.com`, `deep${i}`],
      );
    for (let i = 1; i < ids.length; i++)
      await app.referralGraphService.establish(ids[i], ids[i - 1]);
    expect(await app.referralGraph.getRelationshipDepth(ids[0], ids[40], 40)).toBe(40);
    const deep = await app.hierarchy.tree(ids[0], ids[40], false);
    expect(deep.root).toBe(ids[40]);
    expect(deep.windowDepth).toBe(3);
    expect(deep.parent?.canNavigate).toBe(true);
    const wideParent = ids[40];
    const children = Array.from({ length: 125 }, () => newId());
    for (let i = 0; i < children.length; i++)
      await app.database.query(
        `insert into identity_capability.accounts(id,email,handle) values($1,$2,$3)`,
        [children[i], `wide${i}@example.com`, `wide${i}`],
      );
    for (const child of children) await app.referralGraphService.establish(child, wideParent);
    const boundedTree = await app.hierarchy.tree(ids[0], wideParent, false);
    expect(boundedTree.nodes.find((node) => node.id === wideParent)?.nextChildCursor).toBe(
      [...children].sort()[49],
    );
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await app.hierarchy.children(wideParent, wideParent, false, cursor);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toHaveLength(125);
    expect(new Set(seen).size).toBe(125);
    expect(seen).toEqual([...children].sort());
  });
  it("searches only the authorized descendant closure for normal users", async () => {
    const root = await account("searchroot"),
      child = await account("searchchild"),
      other = await account("searchother");
    await app.referralGraphService.establish(child.id, root.id);
    expect(
      (await app.hierarchy.search(root.id, child.handle, false, 20)).map((x) => x.id),
    ).toContain(child.id);
    expect(await app.hierarchy.search(root.id, other.handle, false, 20)).toEqual([]);
    const operator = await account("searchoperator");
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability) values($1,'operator')`,
      [operator.id],
    );
    expect(
      (await app.hierarchy.search(operator.id, other.handle, true, 20)).map((item) => item.id),
    ).toContain(other.id);
  });
  it("allows only an operator-scoped principal to reassign a parent through Hono", async () => {
    const operator = await account("operator"),
      child = await account("reassign_child"),
      oldParent = await account("old_parent"),
      newParent = await account("new_parent"),
      normal = await account("normal");
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability) values($1,'operator')`,
      [operator.id],
    );
    await app.referralGraphService.establish(child.id, oldParent.id);
    const api = createApiApp({
      ...app,
      principalResolver: {
        resolve: async () => ({
          accountId: operator.id,
          account: operator,
          kind: "user_session",
          roles: ["operator"],
          scopes: new Set<string>(),
        }),
      },
    } as any);
    const response = await api.fetch(
      new Request(`http://localhost/api/operator/hierarchy/${child.id}/parent`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parent_account_id: newParent.id }),
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).previousParentAccountId).toBe(oldParent.id);
    const deniedApi = createApiApp({
      ...app,
      principalResolver: {
        resolve: async () => ({
          accountId: normal.id,
          account: normal,
          kind: "user_session",
          roles: [],
          scopes: new Set<string>(),
        }),
      },
    } as any);
    expect(
      (
        await deniedApi.fetch(
          new Request(`http://localhost/api/operator/hierarchy/${child.id}/parent`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ parent_account_id: oldParent.id }),
          }),
        )
      ).status,
    ).toBe(403);
    const keyApi = createApiApp({
      ...app,
      principalResolver: {
        resolve: async () => ({
          accountId: operator.id,
          account: operator,
          kind: "api_key",
          roles: ["operator"],
          scopes: new Set<string>(["hierarchy:admin"]),
        }),
      },
    } as any);
    expect(
      (
        await keyApi.fetch(
          new Request(`http://localhost/api/operator/hierarchy/${child.id}/parent`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ parent_account_id: oldParent.id }),
          }),
        )
      ).status,
    ).toBe(200);
    const underprivilegedApi = createApiApp({
      ...app,
      principalResolver: {
        resolve: async () => ({
          accountId: operator.id,
          account: operator,
          kind: "api_key",
          roles: ["operator"],
          scopes: new Set<string>(["hierarchy:read"]),
        }),
      },
    } as any);
    expect(
      (
        await underprivilegedApi.fetch(
          new Request(`http://localhost/api/operator/hierarchy/${child.id}/parent`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ parent_account_id: newParent.id }),
          }),
        )
      ).status,
    ).toBe(403);
  });
});
