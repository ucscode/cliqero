import { describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ container: null as any }));
vi.mock("@/infrastructure/container", () => ({ getContainer: () => fixture.container }));

import * as destinations from "@/api/compat/withdrawal-destinations/route";
import * as destinationById from "@/api/compat/withdrawal-destinations/[id]/route";
import * as methods from "@/api/compat/withdrawal-methods/route";

function setup(kind: "user_session" | "api_key", scopes: string[] = []) {
  const principal = {
    accountId: "00000000-0000-4000-8000-000000000001",
    account: { id: "00000000-0000-4000-8000-000000000001", country: "NG" },
    kind,
    capabilities: [],
    scopes: new Set(scopes),
  };
  const methodsFor = vi.fn(async () => []);
  const list = vi.fn(async () => []);
  const create = vi.fn(async () => ({ id: "destination" }));
  const get = vi.fn(async () => ({ id: "destination" }));
  const update = vi.fn(async () => ({ id: "destination" }));
  fixture.container = {
    principalResolver: { resolve: vi.fn(async () => principal) },
    withdrawalDestinations: { methodsFor, list, create, get, update },
  };
  return { principal, methodsFor, list, create, get, update };
}

describe("withdrawal destination resources", () => {
  it("keeps API-key authorization on existing read/create scopes and binds reads to the principal", async () => {
    const read = setup("api_key", ["withdrawals:read"]);
    expect((await methods.GET(new Request("http://localhost/api/withdrawal-methods"))).status).toBe(
      200,
    );
    expect(read.methodsFor).toHaveBeenCalledWith(read.principal.accountId);
    expect(
      (await destinations.GET(new Request("http://localhost/api/withdrawal-destinations"))).status,
    ).toBe(200);
    expect(read.list).toHaveBeenCalledWith(read.principal.accountId);
    expect(
      (
        await destinations.POST(
          new Request("http://localhost/api/withdrawal-destinations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ method: "bank_ng", name: "Primary", values: {} }),
          }),
        )
      ).status,
    ).toBe(403);
    expect(read.create).not.toHaveBeenCalled();
  });

  it("rejects client-owned presentation metadata and exposes only resource PATCH behavior", async () => {
    const session = setup("user_session");
    const invalid = await destinations.POST(
      new Request("http://localhost/api/withdrawal-destinations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          method: "bank_ng",
          name: "Primary",
          values: {},
          label: "spoof",
          fields: [],
        }),
      }),
    );
    expect(invalid.status).toBe(400);
    expect(session.create).not.toHaveBeenCalled();

    const created = await destinations.POST(
      new Request("http://localhost/api/withdrawal-destinations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          method: "bank_ng",
          name: "Primary",
          values: { account: "0123456789" },
        }),
      }),
    );
    expect(created.status).toBe(201);
    expect(session.create).toHaveBeenCalledWith(session.principal.accountId, {
      method: "bank_ng",
      name: "Primary",
      values: { account: "0123456789" },
    });
    expect("DELETE" in destinationById).toBe(false);
  });

  it("requires withdrawals:create for destination resource patches", async () => {
    const apiKey = setup("api_key", ["withdrawals:read"]);
    const response = await destinationById.PATCH(
      new Request("http://localhost/api/withdrawal-destinations/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      }),
      { params: Promise.resolve({ id: "x" }) },
    );
    expect(response.status).toBe(403);
    expect(apiKey.update).not.toHaveBeenCalled();
  });

  it("rejects method-list reads when an API key lacks withdrawals:read", async () => {
    const apiKey = setup("api_key");
    const response = await methods.GET(new Request("http://localhost/api/withdrawal-methods"));
    expect(response.status).toBe(403);
    expect(apiKey.methodsFor).not.toHaveBeenCalled();
  });
});
