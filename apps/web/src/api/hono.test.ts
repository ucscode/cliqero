import { describe, expect, it } from "vitest";
import { createApiApp } from "./hono";
import { authorizeLegacyRequest, getLegacyRouteAccess } from "./legacy-dispatch";

function appWith(principal: any = null) {
  return createApiApp({
    principalResolver: { resolve: async () => principal },
    hierarchy: {
      tree: async () => ({
        root: "00000000-0000-4000-8000-000000000001",
        windowDepth: 3,
        childLimit: 50,
        parent: null,
        nodes: [],
        edges: [],
      }),
      search: async () => [],
    },
    apiKeys: { create: async () => ({}), list: async () => [], revoke: async () => {} },
    operatorOverview: {
      get: async (role: "operator" | "catalogue_manager") => ({
        role,
        catalogue: { published: 4, draft: 1, archived: 2 },
        ...(role === "operator"
          ? {
              users: { total: 9 },
              commerce: { purchases: 6 },
              withdrawals: { requested: 1, approved: 2 },
            }
          : {}),
      }),
    },
    operatorAccounts: {
      list: async () => ({ items: [], nextCursor: null }),
      get: async (id: string) => ({
        id,
        handle: "sample",
        displayName: null,
        email: "sample@example.com",
        country: null,
        roles: [],
        createdAt: new Date().toISOString(),
        directReferralCount: 0,
        parent: null,
        purchaseCount: 0,
        latestParentReassignment: null,
      }),
    },
  } as any);
}
describe("Hono API foundation", () => {
  it("serves an OpenAPI document", async () => {
    const response = await appWith().fetch(new Request("http://localhost/api/openapi.json"));
    expect(response.status).toBe(200);
    const paths = (await response.json()).paths;
    expect(paths["/api/hierarchy/tree"]).toBeDefined();
    expect(paths["/api/hierarchy/children/{parentId}"]).toBeDefined();
    expect(paths["/api/listings"]).toBeDefined();
    expect(paths["/api/wallet"]).toBeDefined();
    expect(paths["/api/operator/treasury/entries"]).toBeDefined();
    expect(paths["/api/api-keys"]).toBeDefined();
    expect(paths["/api/api-keys/{id}/revoke"]).toBeDefined();
    expect(paths["/api/me/access"]).toBeDefined();
    expect(paths["/api/operator/overview"]).toBeDefined();
    expect(paths["/api/operator/accounts"]).toBeDefined();
    expect(paths["/api/operator/accounts/{accountId}"]).toBeDefined();
    expect(paths["/api/operator/listings"]).toBeDefined();
    expect(paths["/api/operator/listings/{id}"]).toBeDefined();
    expect(paths["/api/operator/listings/{id}/integrations"]).toBeDefined();
    expect(paths["/api/operator/listings/{id}/integrations/{integrationId}/rotate"]).toBeDefined();
    expect(paths["/api/operator/overview"].get["x-authentication-mode"]).toBe("account");
    expect(paths["/api/operator/accounts"].get).toMatchObject({
      "x-authentication-mode": "account",
      "x-required-api-scope": "operations:manage (operator)",
    });
    expect(paths["/api/gateway"]).toBeUndefined();
    expect(paths["/api/auth/sessions"]).toBeUndefined();
    expect(paths["/api/listings"].get).toMatchObject({
      "x-authentication-mode": "anonymous",
    });
    expect(paths["/api/wallet"].get).toMatchObject({
      "x-authentication-mode": "account",
      "x-required-api-scope": "wallet:read",
    });
  });
  it("returns standardized auth errors and validates requests", async () => {
    const app = appWith();
    expect((await app.fetch(new Request("http://localhost/api/hierarchy/tree"))).status).toBe(401);
    const principal = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session",
      roles: [],
      scopes: new Set<string>(),
    };
    expect(
      (
        await appWith(principal).fetch(
          new Request("http://localhost/api/hierarchy/tree?root=not-a-uuid"),
        )
      ).status,
    ).toBe(400);
  });
  it("exposes safe current roles and protects the operator overview by role and scope", async () => {
    const ordinary = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session" as const,
      roles: [],
      scopes: new Set<string>(),
    };
    expect((await appWith().fetch(new Request("http://localhost/api/me/access"))).status).toBe(401);
    const access = await appWith(ordinary).fetch(new Request("http://localhost/api/me/access"));
    expect(await access.json()).toEqual({
      accountId: ordinary.accountId,
      roles: [],
      canAccessOperator: false,
    });
    expect(
      (await appWith(ordinary).fetch(new Request("http://localhost/api/operator/overview"))).status,
    ).toBe(403);
    const catalogueManager = { ...ordinary, roles: ["catalogue_manager"] };
    const catalogueResponse = await appWith(catalogueManager).fetch(
      new Request("http://localhost/api/operator/overview"),
    );
    expect(catalogueResponse.status).toBe(200);
    expect((await catalogueResponse.json()).users).toBeUndefined();
    const operator = { ...ordinary, roles: ["operator"] };
    expect(
      (await appWith(operator).fetch(new Request("http://localhost/api/operator/overview"))).status,
    ).toBe(200);
    const missingScope = {
      ...operator,
      kind: "api_key" as const,
      scopes: new Set<string>(),
    };
    expect(
      (await appWith(missingScope).fetch(new Request("http://localhost/api/operator/overview")))
        .status,
    ).toBe(403);
    const scopedOperator = {
      ...operator,
      kind: "api_key" as const,
      scopes: new Set<string>(["operations:manage"]),
    };
    expect(
      (await appWith(scopedOperator).fetch(new Request("http://localhost/api/operator/overview")))
        .status,
    ).toBe(200);
    const elevatedOrdinary = {
      ...ordinary,
      kind: "api_key" as const,
      scopes: new Set<string>(["operations:manage"]),
    };
    expect(
      (await appWith(elevatedOrdinary).fetch(new Request("http://localhost/api/operator/overview")))
        .status,
    ).toBe(403);
  });
  it("allows a resolved principal through the protected read route", async () => {
    const principal = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session",
      roles: [],
      scopes: new Set<string>(),
    };
    const response = await appWith(principal).fetch(
      new Request("http://localhost/api/hierarchy/tree"),
    );
    expect(response.status).toBe(200);
  });
  it("dispatches compatibility application routes through the Hono boundary", async () => {
    const response = await appWith().fetch(new Request("http://localhost/api/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", service: "cliqero-main" });
  });
  it("returns a canonical not-found response for the removed gateway route", async () => {
    const response = await appWith().fetch(new Request("http://localhost/api/gateway"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found", code: "not_found" });
  });
  it("lets Hono decide HEAD, OPTIONS, and unsupported method behavior", async () => {
    const app = appWith();
    expect(
      (await app.fetch(new Request("http://localhost/api/health", { method: "HEAD" }))).status,
    ).toBe(405);
    expect(
      (await app.fetch(new Request("http://localhost/api/health", { method: "OPTIONS" }))).status,
    ).toBe(405);
    expect(
      (await app.fetch(new Request("http://localhost/api/not-a-route", { method: "OPTIONS" })))
        .status,
    ).toBe(404);
  });
  it("rejects unknown API-key scopes at the HTTP contract", async () => {
    const principal = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session",
      roles: ["operator"],
      scopes: new Set<string>(),
    };
    const response = await appWith(principal).fetch(
      new Request("http://localhost/api/operator/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x", scopes: ["hierachy:read"] }),
      }),
    );
    expect(response.status).toBe(400);
  });
  it("keeps personal API-key management owner-scoped and scope constrained", async () => {
    const account = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session" as const,
      roles: [],
      scopes: new Set<string>(),
    };
    const list = await appWith(account).fetch(new Request("http://localhost/api/api-keys"));
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ items: [] });
    const keyPrincipal = { ...account, kind: "api_key" as const };
    const denied = await appWith(keyPrincipal).fetch(new Request("http://localhost/api/api-keys"));
    expect(denied.status).toBe(403);
  });
  it("does not let a normal account grant operator API-key scopes", async () => {
    const principal = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session" as const,
      roles: [],
      scopes: new Set<string>(),
    };
    const response = await appWith(principal).fetch(
      new Request("http://localhost/api/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "elevated", scopes: ["treasury:manage"] }),
      }),
    );
    expect(response.status).toBe(403);
  });
  it("enforces role and API-key scope intersection for compatibility routes", async () => {
    const operatorKey = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "api_key" as const,
      roles: ["operator"],
      scopes: new Set<string>(["operations:manage"]),
    } as any;
    const operatorScope = getLegacyRouteAccess("/api/operator/settlement", "POST");
    expect(operatorScope).toEqual({ mode: "account", scope: "operations:manage" });
    expect(
      authorizeLegacyRequest(
        new Request("http://localhost/api/operator/settlement", { method: "POST" }),
        operatorKey,
        operatorScope!,
      ),
    ).toBeNull();
    const missingScope = getLegacyRouteAccess("/api/operator/settlement", "POST");
    const denied = authorizeLegacyRequest(
      new Request("http://localhost/api/operator/settlement", { method: "POST" }),
      { ...operatorKey, scopes: new Set<string>() },
      missingScope!,
    );
    expect(denied?.status).toBe(403);
    const normalKey = authorizeLegacyRequest(
      new Request("http://localhost/api/operator/settlement", { method: "POST" }),
      { ...operatorKey, roles: [], scopes: new Set<string>(["operations:manage"]) },
      operatorScope!,
    );
    expect(normalKey).toBeNull();
    expect(getLegacyRouteAccess("/api/listings", "GET")).toEqual({
      mode: "anonymous",
      apiKey: "allow",
    });
    expect(
      getLegacyRouteAccess("/api/listings/00000000-0000-4000-8000-000000000001", "GET"),
    ).toEqual({
      mode: "anonymous",
      apiKey: "allow",
    });
    expect(getLegacyRouteAccess("/api/listings/export", "GET")).toEqual({
      mode: "account",
      scope: "catalogue:manage",
    });
    expect(
      getLegacyRouteAccess(
        "/api/operator/listings/00000000-0000-4000-8000-000000000001/integrations",
        "GET",
      ),
    ).toEqual({
      mode: "account",
      scope: "catalogue:manage",
    });
    expect(
      getLegacyRouteAccess("/api/listings/00000000-0000-4000-8000-000000000001", "PATCH"),
    ).toEqual({
      mode: "account",
      scope: "catalogue:manage",
    });
    expect(
      getLegacyRouteAccess(
        "/api/listings/00000000-0000-4000-8000-000000000001/referral-link",
        "POST",
      ),
    ).toEqual({
      mode: "account",
      scope: "referrals:manage",
    });
    expect(getLegacyRouteAccess("/api/referral-links", "GET")).toEqual({
      mode: "account",
      scope: "referrals:read",
    });
    expect(
      authorizeLegacyRequest(
        new Request("http://localhost/api/listings/00000000-0000-4000-8000-000000000001", {
          method: "PATCH",
          headers: { authorization: "Bearer cliq_live_test" },
        }),
        { ...operatorKey, scopes: new Set<string>() },
        getLegacyRouteAccess("/api/listings/00000000-0000-4000-8000-000000000001", "PATCH")!,
      )?.status,
    ).toBe(403);
    expect(
      getLegacyRouteAccess("/api/withdrawals/00000000-0000-4000-8000-000000000001", "DELETE"),
    ).toEqual({
      mode: "account",
      scope: "withdrawals:manage",
    });
    const publicDetail = authorizeLegacyRequest(
      new Request("http://localhost/api/listings/00000000-0000-4000-8000-000000000001", {
        method: "GET",
        headers: { authorization: "Bearer cliq_live_test" },
      }),
      operatorKey,
      getLegacyRouteAccess("/api/listings/00000000-0000-4000-8000-000000000001", "GET")!,
    );
    expect(publicDetail).toBeNull();
  });
  it("lets an authenticated but incomplete session reach onboarding only", () => {
    const access = getLegacyRouteAccess("/api/me/onboarding", "POST");
    expect(access).toEqual({
      mode: "session_only",
      apiKey: "reject",
      allowIncompleteSession: true,
    });
    expect(
      authorizeLegacyRequest(
        new Request("http://localhost/api/me/onboarding", { method: "POST" }),
        null,
        access!,
      ),
    ).toBeNull();
    const keyDenied = authorizeLegacyRequest(
      new Request("http://localhost/api/me/onboarding", { method: "POST" }),
      { accountId: "account", account: {}, kind: "api_key", roles: [], scopes: new Set() } as any,
      access!,
    );
    expect(keyDenied?.status).toBe(403);
  });
  it("keeps incomplete sessions out of unrelated account and operator APIs", async () => {
    const app = appWith();
    for (const path of [
      "/api/wallet",
      "/api/purchases",
      "/api/checkout",
      "/api/operator/treasury",
    ]) {
      const request =
        path === "/api/checkout"
          ? new Request(`http://localhost${path}`, { method: "POST" })
          : new Request(`http://localhost${path}`);
      expect((await app.fetch(request)).status).toBe(401);
    }
  });
  it("does not let an API-key scope elevate a non-operator account", async () => {
    const principal = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "api_key" as const,
      roles: [],
      scopes: new Set<string>(["hierarchy:admin"]),
    } as any;
    const response = await appWith(principal).fetch(
      new Request(
        "http://localhost/api/operator/hierarchy/00000000-0000-4000-8000-000000000002/parent",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ parent_account_id: "00000000-0000-4000-8000-000000000003" }),
        },
      ),
    );
    expect(response.status).toBe(403);
  });
  it("protects operator account inspection with role and operations scope", async () => {
    const ordinary = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "user_session" as const,
      roles: [],
      scopes: new Set<string>(),
    };
    expect(
      (await appWith().fetch(new Request("http://localhost/api/operator/accounts"))).status,
    ).toBe(401);
    expect(
      (await appWith(ordinary).fetch(new Request("http://localhost/api/operator/accounts"))).status,
    ).toBe(403);
    expect(
      (
        await appWith({ ...ordinary, roles: ["catalogue_manager"] }).fetch(
          new Request("http://localhost/api/operator/accounts"),
        )
      ).status,
    ).toBe(403);
    const operator = { ...ordinary, roles: ["operator"] };
    expect(
      (await appWith(operator).fetch(new Request("http://localhost/api/operator/accounts"))).status,
    ).toBe(200);
    expect(
      (
        await appWith({ ...operator, kind: "api_key", scopes: new Set<string>() }).fetch(
          new Request("http://localhost/api/operator/accounts"),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await appWith({
          ...operator,
          kind: "api_key",
          scopes: new Set(["operations:manage"]),
        }).fetch(new Request("http://localhost/api/operator/accounts"))
      ).status,
    ).toBe(200);
    expect(
      (
        await appWith({
          ...ordinary,
          kind: "api_key",
          scopes: new Set(["operations:manage"]),
        }).fetch(new Request("http://localhost/api/operator/accounts"))
      ).status,
    ).toBe(403);
  });
  it("allows an operator hierarchy key to use hierarchy:admin without a redundant read scope", async () => {
    const principal = {
      accountId: "00000000-0000-4000-8000-000000000001",
      account: {},
      kind: "api_key" as const,
      roles: ["operator"],
      scopes: new Set<string>(["hierarchy:admin"]),
    };
    const response = await appWith(principal).fetch(
      new Request("http://localhost/api/hierarchy/tree?root=00000000-0000-4000-8000-000000000002"),
    );
    expect(response.status).toBe(200);
  });
});
