import { describe, expect, it, vi } from "vitest";
import { Account } from "@/modules/identity/account";

const fixtures = vi.hoisted(() => ({ container: null as any }));

vi.mock("@/infrastructure/container", () => ({
  getContainer: () => fixtures.container,
}));

import { GET, POST, onboardingBoundaryResponse } from "@/api/compat/me/onboarding/route";

const account = new Account("550e8400-e29b-41d4-a716-446655440000", "complete_user");

function principal(
  authLinkState: "incomplete" | "complete" | "missing",
  linkedAccount: Account | null = null,
) {
  return { authUserId: "auth-user", account: linkedAccount, authLinkState } as const;
}

function configurePrincipal(value: ReturnType<typeof principal> | null) {
  fixtures.container = {
    authentication: {
      principal: vi.fn(async () => value),
      hasPasswordCredential: vi.fn(async () => true),
      completeOnboarding: vi.fn(async () => account),
    },
    profiles: {
      get: vi.fn(async () => ({ email: "complete_user@example.test" })),
    },
  };
}

describe("onboarding authentication boundary", () => {
  it("allows only an explicit incomplete link", async () => {
    const response = onboardingBoundaryResponse(principal("incomplete"));
    expect(response).toBeNull();
  });

  it("returns the existing complete-account response", async () => {
    const response = onboardingBoundaryResponse(principal("complete", account));
    expect(response?.status).toBe(409);
    await expect(response?.json()).resolves.toEqual({
      error: "Account onboarding is already complete",
    });
  });

  it.each([
    [null, { error: "Unauthorized", code: "unauthorized" }],
    [principal("missing"), { error: "Invalid session", code: "invalid_session" }],
    [principal("complete"), { error: "Invalid session", code: "invalid_session" }],
    [principal("incomplete", account), { error: "Invalid session", code: "invalid_session" }],
  ] as const)("rejects an invalid onboarding principal", async (value, expected) => {
    const response = onboardingBoundaryResponse(value);
    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual(expected);
  });

  it("allows GET and POST only for an explicit incomplete link", async () => {
    configurePrincipal(principal("incomplete"));

    const getResponse = await GET(new Request("http://localhost/api/me/onboarding"));
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual({ hasPassword: true });

    const postResponse = await POST(
      new Request("http://localhost/api/me/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "complete_user", country: "NG" }),
      }),
    );
    expect(postResponse.status).toBe(201);
  });

  it.each([
    ["GET", GET],
    ["POST", POST],
  ] as const)("rejects an orphaned session on %s", async (method, handler) => {
    configurePrincipal(principal("missing"));
    const response = await handler(new Request("http://localhost/api/me/onboarding"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid session",
      code: "invalid_session",
    });
  });
});
