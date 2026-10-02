import { describe, expect, it, vi } from "vitest";
import { InternalFundingRoutes } from "@/api/internal/funding/handler";

const accountId = "00000000-0000-4000-8000-000000000001";
const targetId = "00000000-0000-4000-8000-000000000002";

function harness() {
  const createAdministrative = vi.fn(async (_actor: string, input: unknown) => input);
  const routes = new InternalFundingRoutes({
    principalResolver: {
      resolve: vi.fn(async () => ({
        kind: "user_session",
        accountId,
        capabilities: ["system.root"],
      })),
    },
    operatorFunding: { createAdministrative },
    operatorAccounts: {},
  } as never);
  return { routes, createAdministrative };
}

function request(key?: string) {
  return new Request("http://localhost/internal/funding", {
    method: "POST",
    headers: {
      host: "localhost",
      origin: "http://localhost",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify({
      account_id: targetId,
      amount_minor: "1200",
      state: "confirmed",
      reason: "Cash deposit",
    }),
  });
}

describe("Internal administrative funding creation", () => {
  it("requires and forwards the Idempotency-Key header", async () => {
    const { routes, createAdministrative } = harness();
    expect((await routes.create(request())).status).toBe(400);
    expect(createAdministrative).not.toHaveBeenCalled();
    const response = await routes.create(request("funding-key-1"));
    expect(response.status).toBe(201);
    expect(createAdministrative).toHaveBeenCalledWith(
      accountId,
      expect.objectContaining({ idempotencyKey: "funding-key-1" }),
    );
  });
});
