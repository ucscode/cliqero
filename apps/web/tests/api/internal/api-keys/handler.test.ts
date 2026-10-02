import { describe, expect, it, vi } from "vitest";
import {
  InternalApiKeyManagementRoutes,
  ApiKeyManagementRateLimiter,
} from "@/api/internal/api-keys/handler";
import { PublicApplicationError } from "@/kernel/errors";
import { API_SCOPES, assertApiScopes } from "@/modules/identity/api/scopes";

const sessionPrincipal = {
  kind: "user_session" as const,
  accountId: "00000000-0000-4000-8000-000000000001",
  account: { id: "00000000-0000-4000-8000-000000000001" },
  capabilities: ["api_keys.manage"],
  scopes: new Set<string>(),
};

function routes(principal: any = sessionPrincipal) {
  const resolve = vi.fn(async () => principal);
  const operatorApiKeys: any = {
    listForSession: vi.fn(async () => ({ items: [], manageableScopes: [], nextCursor: null })),
    createForSession: vi.fn(async () => ({
      id: "00000000-0000-4000-8000-000000000002",
      accountId: sessionPrincipal.accountId,
      name: "test key",
      secret: "cliq_live_one_time_secret",
      scopes: [],
      keyPrefix: "cliq_live_test",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      expiresAt: null,
    })),
    getForSession: vi.fn(),
    updateForSession: vi.fn(),
    revokeForSession: vi.fn(),
    deleteForSession: vi.fn(),
    bulkDeleteForSession: vi.fn(async () => ({ succeeded: [], failed: [] })),
    reassignForSession: vi.fn(),
    revealForSession: vi.fn(async () => ({ secret: "cliq_live_recovered", legacy: false })),
    rotateForSession: vi.fn(),
  };
  return {
    handler: new InternalApiKeyManagementRoutes(
      { principalResolver: { resolve }, operatorApiKeys } as never,
      new ApiKeyManagementRateLimiter(),
    ),
    resolve,
    operatorApiKeys,
  };
}

const request = (path: string, init?: RequestInit) =>
  new Request(`https://cliqero.test${path}`, {
    ...init,
    headers: { host: "cliqero.test", ...Object.fromEntries(new Headers(init?.headers)) },
  });

describe("internal API-key management boundary", () => {
  it("requires a resolved user session and rejects any bearer header, including alongside a session", async () => {
    const anonymous = routes({ ...sessionPrincipal, kind: "anonymous" as never });
    expect((await anonymous.handler.collection(request("/internal/api-keys"))).status).toBe(401);

    const apiKey = routes({ ...sessionPrincipal, kind: "api_key" });
    expect((await apiKey.handler.collection(request("/internal/api-keys"))).status).toBe(401);

    const sessionAndBearer = routes();
    const response = await sessionAndBearer.handler.collection(
      request("/internal/api-keys", { headers: { authorization: "Bearer cliq_live_any" } }),
    );
    expect(response.status).toBe(401);
    expect(sessionAndBearer.resolve).not.toHaveBeenCalled();

    const invalidBearer = routes({ ...sessionPrincipal, kind: "anonymous" as never });
    expect(
      (
        await invalidBearer.handler.collection(
          request("/internal/api-keys", { headers: { authorization: "Bearer invalid" } }),
        )
      ).status,
    ).toBe(401);
  });

  it("requires same-origin protection on mutations and applies the management service policy", async () => {
    const boundary = routes();
    const noOrigin = await boundary.handler.create(
      request("/internal/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x", scopes: [] }),
      }),
    );
    expect(noOrigin.status).toBe(403);
    expect(boundary.resolve).not.toHaveBeenCalled();

    const crossOrigin = await boundary.handler.create(
      request("/internal/api-keys", {
        method: "POST",
        headers: { origin: "https://attacker.test", "content-type": "application/json" },
        body: JSON.stringify({ name: "x", scopes: [] }),
      }),
    );
    expect(crossOrigin.status).toBe(403);

    const noAuthority = routes({ ...sessionPrincipal, capabilities: [] });
    noAuthority.operatorApiKeys.listForSession.mockRejectedValue(
      new PublicApplicationError("Forbidden", "forbidden", 403),
    );
    const denied = await noAuthority.handler.collection(request("/internal/api-keys"));
    expect(denied.status).toBe(403);

    const allowed = await boundary.handler.collection(request("/internal/api-keys"));
    expect(allowed.status).toBe(200);
    expect(noAuthority.operatorApiKeys.listForSession).toHaveBeenCalledWith(
      sessionPrincipal.accountId,
      expect.objectContaining({ state: "all", sort: "created", direction: "desc", limit: 25 }),
    );
  });

  it("returns a generated secret once and never includes it in metadata responses", async () => {
    const boundary = routes();
    const created = await boundary.handler.create(
      request("/internal/api-keys", {
        method: "POST",
        headers: { origin: "https://cliqero.test", "content-type": "application/json" },
        body: JSON.stringify({ name: "test key", scopes: [] }),
      }),
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ secret: "cliq_live_one_time_secret" });

    boundary.operatorApiKeys.listForSession.mockResolvedValue({
      items: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          accountId: sessionPrincipal.accountId,
          name: "test key",
          keyPrefix: "cliq_live_test",
          scopes: [],
          createdAt: new Date("2026-01-01T00:00:00Z"),
          lastUsedAt: null,
          expiresAt: null,
          revokedAt: null,
        },
      ],
      manageableScopes: [],
      nextCursor: null,
    });
    const listed = await boundary.handler.collection(request("/internal/api-keys"));
    const body = await listed.json();
    expect(body.items[0].secret).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("cliq_live_one_time_secret");
    expect(body.items[0].key_prefix).toBeUndefined();
  });

  it("limits sensitive mutations per session account in a fixed window", () => {
    let now = 10_000;
    const limiter = new ApiKeyManagementRateLimiter(2, 1_000, () => now);
    expect(limiter.allow("account-a")).toBe(true);
    expect(limiter.allow("account-a")).toBe(true);
    expect(limiter.allow("account-a")).toBe(false);
    expect(limiter.allow("account-b")).toBe(true);
    now += 1_000;
    expect(limiter.allow("account-a")).toBe(true);
  });

  it("reveals only through a same-origin user session and never a bearer credential", async () => {
    const boundary = routes();
    const crossOrigin = await boundary.handler.secret(
      request("/internal/api-keys/key/secret", { headers: { origin: "https://attacker.test" } }),
      "00000000-0000-4000-8000-000000000002",
    );
    expect(crossOrigin.status).toBe(403);
    expect(boundary.operatorApiKeys.revealForSession).not.toHaveBeenCalled();

    const recovered = await boundary.handler.secret(
      request("/internal/api-keys/key/secret", { headers: { origin: "https://cliqero.test" } }),
      "00000000-0000-4000-8000-000000000002",
    );
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toEqual({ secret: "cliq_live_recovered", legacy: false });
    expect(boundary.operatorApiKeys.revealForSession).toHaveBeenCalledWith(
      sessionPrincipal.accountId,
      "00000000-0000-4000-8000-000000000002",
    );
  });

  it("accepts one same-origin bulk-delete request and delegates IDs once to the service", async () => {
    const boundary = routes();
    boundary.operatorApiKeys.bulkDeleteForSession.mockResolvedValue({
      succeeded: ["key-1"],
      failed: [{ id: "key-2", message: "API key not found." }],
    });
    const response = await boundary.handler.bulkDelete(
      request("/internal/api-keys/actions/delete", {
        method: "POST",
        headers: { origin: "https://cliqero.test", "content-type": "application/json" },
        body: JSON.stringify({ ids: ["00000000-0000-4000-8000-000000000001"] }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      succeeded: ["key-1"],
      failed: [{ id: "key-2", message: "API key not found." }],
    });
    expect(boundary.operatorApiKeys.bulkDeleteForSession).toHaveBeenCalledOnce();
    expect(boundary.operatorApiKeys.bulkDeleteForSession).toHaveBeenCalledWith(
      sessionPrincipal.accountId,
      ["00000000-0000-4000-8000-000000000001"],
    );
  });

  it("rejects cross-origin bulk delete before resolving the session", async () => {
    const boundary = routes();
    const response = await boundary.handler.bulkDelete(
      request("/internal/api-keys/actions/delete", {
        method: "POST",
        headers: { origin: "https://attacker.test", "content-type": "application/json" },
        body: JSON.stringify({ ids: ["00000000-0000-4000-8000-000000000001"] }),
      }),
    );
    expect(response.status).toBe(403);
    expect(boundary.resolve).not.toHaveBeenCalled();
    expect(boundary.operatorApiKeys.bulkDeleteForSession).not.toHaveBeenCalled();
  });

  it("keeps API-key administration out of the external API scope registry", () => {
    expect(API_SCOPES).not.toContain("api_keys:manage");
    expect(() => assertApiScopes(["api_keys:manage"])).toThrow();
  });
});
