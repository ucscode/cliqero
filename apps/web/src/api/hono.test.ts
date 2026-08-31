import { describe, expect, it } from "vitest";
import { createApiApp } from "./hono";

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
  } as any);
}
describe("Hono API foundation", () => {
  it("serves an OpenAPI document", async () => {
    const response = await appWith().fetch(new Request("http://localhost/api/openapi.json"));
    expect(response.status).toBe(200);
    const paths = (await response.json()).paths;
    expect(paths["/api/hierarchy/tree"]).toBeDefined();
    expect(paths["/api/hierarchy/children/{parentId}"]).toBeDefined();
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
});
