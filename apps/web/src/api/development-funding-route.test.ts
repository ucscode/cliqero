import { afterEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => fixtures.container,
}));

import {
  POST,
  developmentFundingVerificationEnabled,
} from "@/app/api/funding/development/verify/route";

const sessionAccount = { id: "00000000-0000-4000-8000-000000000001" };
const otherAccount = { id: "00000000-0000-4000-8000-000000000002" };
const fundingId = "00000000-0000-4000-8000-000000000010";

function request(token = "session-token") {
  return new Request("http://localhost/api/funding/development/verify", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ funding_id: fundingId }),
  });
}

function configure(account: typeof sessionAccount | null, funding: any) {
  fixtures.container = {
    principalResolver: {
      resolve: vi.fn(async () =>
        account
          ? {
              accountId: account.id,
              account,
              kind: "user_session",
              roles: [],
              scopes: new Set(),
            }
          : null,
      ),
    },
    funding: { findById: vi.fn(async () => funding) },
    fundingVerification: { process: vi.fn(async () => ({ ...funding, state: "confirmed" })) },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  fixtures.container = null;
});

describe("development funding verification boundary", () => {
  it("rejects API-key principals", async () => {
    fixtures.container = {
      principalResolver: {
        resolve: vi.fn(async () => ({
          accountId: sessionAccount.id,
          account: sessionAccount,
          kind: "api_key",
          roles: [],
          scopes: new Set(),
        })),
      },
    };
    const response = await POST(request("cliq_live_test"));
    expect(response.status).toBe(401);
  });

  it("requires ownership and the development provider", async () => {
    const wrongOwner = { id: fundingId, accountId: otherAccount.id, providerName: "development" };
    configure(sessionAccount, wrongOwner);
    expect((await POST(request())).status).toBe(404);
    expect(fixtures.container.fundingVerification.process).not.toHaveBeenCalled();

    const nonDevelopment = {
      id: fundingId,
      accountId: sessionAccount.id,
      providerName: "paystack",
    };
    configure(sessionAccount, nonDevelopment);
    expect((await POST(request())).status).toBe(404);
    expect(fixtures.container.fundingVerification.process).not.toHaveBeenCalled();
  });

  it("verifies development funding only outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const funding = { id: fundingId, accountId: sessionAccount.id, providerName: "development" };
    configure(sessionAccount, funding);
    expect(developmentFundingVerificationEnabled()).toBe(true);
    expect((await POST(request())).status).toBe(200);

    vi.stubEnv("NODE_ENV", "production");
    expect(developmentFundingVerificationEnabled()).toBe(false);
    expect((await POST(request())).status).toBe(404);
    expect(fixtures.container.fundingVerification.process).toHaveBeenCalledTimes(1);
  });
});
