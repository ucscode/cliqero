import { describe, expect, it, vi } from "vitest";
import { InternalEarningsAdjustmentRoutes } from "@/api/internal/earnings-adjustments/handler";
import type { ApiPrincipal } from "@/modules/identity/api/principal";
import { Account } from "@/modules/identity/account";

const principal = {
  kind: "user_session" as const,
  accountId: "00000000-0000-4000-8000-000000000001",
  account: new Account("00000000-0000-4000-8000-000000000001", "adjustment-actor", "NG"),
  capabilities: ["finance.manage"] as const,
  scopes: new Set<string>(),
};
const request = (origin: string | null, body: unknown) =>
  new Request("https://cliqero.test/internal/earnings-adjustments", {
    method: "POST",
    headers: {
      host: "cliqero.test",
      ...(origin === null ? {} : { origin }),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

function setup(resolvedPrincipal: ApiPrincipal = principal) {
  const resolve = vi.fn(async (): Promise<ApiPrincipal> => resolvedPrincipal);
  const create = vi.fn(async (actorId: string, input: unknown) => ({
    id: "adjustment-1",
    actorId,
    input,
  }));
  const routes = new InternalEarningsAdjustmentRoutes({
    principalResolver: { resolve } as never,
    earningsAdjustments: { create } as never,
  });
  return { routes, resolve, create };
}

describe("internal earnings-adjustment route", () => {
  const validBody = {
    account_id: "00000000-0000-4000-8000-000000000002",
    amount_minor: "1250",
    reason: "Support correction",
    reference: null,
  };

  it("requires a same-origin session and rejects API-key authorization", async () => {
    const noOrigin = setup();
    expect((await noOrigin.routes.create(request(null, validBody))).status).toBe(403);
    expect(noOrigin.resolve).not.toHaveBeenCalled();

    const malformedOrigin = setup();
    expect((await malformedOrigin.routes.create(request("not a URL", validBody))).status).toBe(403);
    expect(malformedOrigin.resolve).not.toHaveBeenCalled();

    const apiKey = setup({ ...principal, kind: "api_key" });
    expect((await apiKey.routes.create(request("https://cliqero.test", validBody))).status).toBe(
      401,
    );

    const bearer = setup();
    expect(
      (
        await bearer.routes.create(
          new Request("https://cliqero.test/internal/earnings-adjustments", {
            method: "POST",
            headers: {
              host: "cliqero.test",
              authorization: "Bearer cliq_live_fake",
              origin: "https://cliqero.test",
              "content-type": "application/json",
            },
            body: JSON.stringify(validBody),
          }),
        )
      ).status,
    ).toBe(401);
    expect(bearer.resolve).not.toHaveBeenCalled();
  });

  it("posts signed USD minor units through the service once", async () => {
    const boundary = setup();
    const response = await boundary.routes.create(request("https://cliqero.test", validBody));
    expect(response.status).toBe(201);
    expect(boundary.create).toHaveBeenCalledOnce();
    expect(boundary.create).toHaveBeenCalledWith(principal.accountId, {
      accountId: validBody.account_id,
      amountMinor: "1250",
      reason: "Support correction",
      reference: null,
    });
  });
});
