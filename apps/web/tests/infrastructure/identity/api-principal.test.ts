import { describe, expect, it, vi } from "vitest";
import { ApiPrincipalResolver } from "@/infrastructure/identity/api-principal";
import { Account } from "@/modules/identity/account";

describe("ApiPrincipalResolver", () => {
  it("resolves one principal once for the same request object", async () => {
    const account = new Account("00000000-0000-4000-8000-000000000001", "test_user");
    const authenticateRequest = vi.fn(async () => account);
    const query = vi.fn(async () => ({ rows: [{ capability: "catalogue.manage" }] }));
    const resolver = new ApiPrincipalResolver(
      { authenticateRequest } as never,
      { authenticate: vi.fn() } as never,
      { query } as never,
    );
    const request = new Request("http://localhost/api/listings");

    const first = resolver.resolve(request);
    const second = resolver.resolve(request);

    expect(first).toBe(second);
    await expect(first).resolves.toMatchObject({
      kind: "user_session",
      accountId: account.id,
      account,
      capabilities: ["catalogue.manage"],
      scopes: new Set(),
    });
    expect(authenticateRequest).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("represents an unauthenticated request as an explicit anonymous principal", async () => {
    const resolver = new ApiPrincipalResolver(
      { authenticateRequest: vi.fn(async () => null) } as never,
      { authenticate: vi.fn() } as never,
      { query: vi.fn() } as never,
    );

    await expect(resolver.resolve(new Request("http://localhost/api/listings"))).resolves.toEqual({
      kind: "anonymous",
      accountId: null,
      account: null,
      capabilities: [],
      scopes: new Set(),
    });
  });
});
