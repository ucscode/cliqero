import { describe, expect, it, vi } from "vitest";
import { InternalWithdrawalRoutes } from "@/api/internal/withdrawals/handler";

const accountId = "00000000-0000-4000-8000-000000000001";
const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

function harness() {
  const remove = vi.fn(async (_actor: string, id: string) => {
    if (id === uuid("2")) throw new Error("completed payout is immutable");
    return { id, deleted: true };
  });
  const container = {
    principalResolver: {
      resolve: vi.fn(async () => ({
        kind: "user_session",
        accountId,
        capabilities: ["withdrawals.manage"],
      })),
    },
    operatorWithdrawals: { list: vi.fn(), get: vi.fn() },
    withdrawals: { delete: remove },
    withdrawalDestinations: { list: vi.fn() },
    operatorAccounts: { list: vi.fn() },
  };
  return { routes: new InternalWithdrawalRoutes(container as never), remove };
}

describe("internal Operator withdrawal routes", () => {
  it("uses one session-only bulk request and returns per-record outcomes", async () => {
    const { routes, remove } = harness();
    const response = await routes.bulkDelete(
      new Request("http://localhost/internal/withdrawals/bulk-delete", {
        method: "POST",
        headers: {
          host: "localhost",
          origin: "http://localhost",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
        },
        body: JSON.stringify({ ids: [uuid("1"), uuid("2"), uuid("3")] }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [
        { id: uuid("1"), deleted: true, error: null },
        { id: uuid("2"), deleted: false, error: "completed payout is immutable" },
        { id: uuid("3"), deleted: true, error: null },
      ],
    });
    expect(remove).toHaveBeenCalledTimes(3);
    expect(remove).toHaveBeenNthCalledWith(1, accountId, uuid("1"));
  });

  it("rejects API-key authorization on the internal mutation surface", async () => {
    const { routes, remove } = harness();
    const response = await routes.delete(
      new Request(`http://localhost/internal/withdrawals/${uuid("1")}`, {
        method: "DELETE",
        headers: {
          host: "localhost",
          authorization: "Bearer test-key",
          origin: "http://localhost",
          "sec-fetch-site": "same-origin",
        },
      }),
      uuid("1"),
    );
    expect(response.status).toBe(401);
    expect(remove).not.toHaveBeenCalled();
  });
});
