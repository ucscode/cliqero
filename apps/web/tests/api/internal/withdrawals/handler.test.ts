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
    operatorWithdrawals: { list: vi.fn(), get: vi.fn(async (id: string) => ({ id })) },
    withdrawals: {
      requestByOperator: vi.fn(async (_actor: string, input: unknown) => ({
        id: uuid("9"),
        input,
      })),
      delete: remove,
      update: vi.fn(async (_actor: string, id: string, input: unknown) => ({ id, input })),
    },
    withdrawalDestinations: { list: vi.fn() },
    operatorAccounts: { list: vi.fn() },
  };
  return { routes: new InternalWithdrawalRoutes(container as never), remove, container };
}

describe("internal Operator withdrawal routes", () => {
  const sameOriginJson = (url: string, method: string, value: unknown) =>
    new Request(url, {
      method,
      headers: {
        host: "localhost",
        origin: "http://localhost",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
      },
      body: JSON.stringify(value),
    });

  it("keeps ordinary status changes on PATCH and rejects completion-only fields", async () => {
    const { routes, container } = harness();
    const patch = await routes.update(
      sameOriginJson(`http://localhost/internal/withdrawals/${uuid("1")}`, "PATCH", {
        state: "approved",
      }),
      uuid("1"),
    );
    expect(patch.status).toBe(200);
    expect(container.withdrawals.update).toHaveBeenCalledWith(accountId, uuid("1"), {
      amountMinor: undefined,
      destinationId: undefined,
      state: "approved",
      reason: undefined,
    });

    for (const payload of [
      { external_reference: "ignored" },
      { note: "ignored" },
      { state: "completed", external_reference: "transfer-1" },
    ]) {
      const response = await routes.update(
        sameOriginJson(`http://localhost/internal/withdrawals/${uuid("1")}`, "PATCH", payload),
        uuid("1"),
      );
      expect(response.status).toBe(400);
    }
  });

  it("creates requested/approved/rejected records through ordinary create semantics without a follow-up read", async () => {
    const { routes, container } = harness();
    const response = await routes.create(
      sameOriginJson("http://localhost/internal/withdrawals", "POST", {
        account_id: uuid("1"),
        amount_minor: "1200",
        destination_id: uuid("2"),
        idempotency_key: uuid("3"),
        state: "rejected",
        reason: "Not eligible for payout",
      }),
    );
    expect(response.status).toBe(201);
    expect(container.withdrawals.requestByOperator).toHaveBeenCalledWith(accountId, {
      accountId: uuid("1"),
      amountMinor: "1200",
      destinationId: uuid("2"),
      idempotencyKey: uuid("3"),
      state: "rejected",
      reason: "Not eligible for payout",
    });
    expect(container.operatorWithdrawals.get).not.toHaveBeenCalled();

    const invalid = await routes.create(
      sameOriginJson("http://localhost/internal/withdrawals", "POST", {
        account_id: uuid("1"),
        amount_minor: "1200",
        destination_id: uuid("2"),
        idempotency_key: uuid("4"),
        state: "rejected",
      }),
    );
    expect(invalid.status).toBe(400);
    expect(container.withdrawals.requestByOperator).toHaveBeenCalledTimes(1);
  });

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
