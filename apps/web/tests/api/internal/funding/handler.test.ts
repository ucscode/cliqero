import { describe, expect, it, vi } from "vitest";
import { InternalFundingAccountRoutes } from "@/api/internal/funding/handler";

describe("internal funding account selector", () => {
  it("retains only the first-party account search helper", async () => {
    const list = vi.fn(async () => ({ items: [], nextCursor: null }));
    const routes = new InternalFundingAccountRoutes({
      principalResolver: {
        resolve: vi.fn(async () => ({
          kind: "user_session",
          accountId: "00000000-0000-4000-8000-000000000001",
          capabilities: ["finance.manage"],
        })),
      },
      operatorAccounts: { list },
    } as never);
    const response = await routes.list(
      new Request("http://localhost/internal/funding/accounts?search=member"),
    );
    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith({ search: "member", limit: 20 });
  });
});
