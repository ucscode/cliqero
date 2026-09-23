import { describe, expect, it, vi } from "vitest";
import { WithdrawalService } from "@/application/withdrawal/service";
import { Money } from "@/modules/money/money";
import type { Withdrawal } from "@/modules/withdrawal/withdrawal";

function fixture(state: Withdrawal["state"] = "approved") {
  const withdrawal: Withdrawal = {
    id: "withdrawal-1",
    accountId: "account-1",
    amount: Money.of(2500n, "USD"),
    destinationType: "manual",
    destinationReference: "masked-destination",
    state,
    idempotencyKey: "key-1",
    correlationId: "correlation-1",
    reason: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
  const completedAt = new Date("2026-02-01T00:00:00Z");
  const complete = vi.fn(async () => completedAt);
  const releaseOrComplete = vi.fn(async () => undefined);
  const append = vi.fn(async () => undefined);
  const requireCapability = vi.fn(async () => undefined);
  const service = new WithdrawalService(
    {
      findById: async () => withdrawal,
      findByIdForUpdate: async () => withdrawal,
      findByIdempotencyKey: async () => null,
      listForAccount: async () => [],
      listForOperator: async () => [],
      create: async () => undefined,
      transition: async () => undefined,
      complete,
    },
    {
      getActive: async () => ({
        minimumAmount: Money.of(1n, "USD"),
        maximumAmount: null,
        enabled: true,
      }),
    },
    {
      reserve: async () => ({
        id: "reservation-1",
        withdrawalId: withdrawal.id,
        accountId: withdrawal.accountId,
        amount: withdrawal.amount,
      }),
      available: async () => 0n,
      releaseOrComplete,
      summarize: async () => [],
    },
    { append },
    { transaction: async (operation) => operation() },
    {
      capabilities: async () => [],
      hasCapability: async () => false,
      requireCapability,
    },
    { withIdempotencyLock: async (_key, operation) => operation() },
  );
  return { service, withdrawal, complete, releaseOrComplete, append, requireCapability };
}

describe("WithdrawalService manual completion", () => {
  it("records completion facts and completes the reserved funds once", async () => {
    const { service, withdrawal, complete, releaseOrComplete, append, requireCapability } =
      fixture();

    const result = await service.complete("operator-1", withdrawal.id, {
      externalReference: "transfer-abc",
      note: "Sent from the bank portal",
    });

    expect(requireCapability).toHaveBeenCalledWith("operator-1", "withdrawals.manage");
    expect(complete).toHaveBeenCalledWith(
      withdrawal.id,
      "operator-1",
      "transfer-abc",
      "Sent from the bank portal",
    );
    expect(releaseOrComplete).toHaveBeenCalledTimes(1);
    expect(releaseOrComplete).toHaveBeenCalledWith({
      withdrawalId: withdrawal.id,
      accountId: withdrawal.accountId,
      kind: "completed",
      correlationId: withdrawal.correlationId,
    });
    expect(result).toMatchObject({
      state: "completed",
      externalReference: "transfer-abc",
      completionNote: "Sent from the bank portal",
      completedBy: "operator-1",
    });
    expect(result.completedAt).toBeInstanceOf(Date);
    expect(append).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "withdrawal.completed",
        aggregateId: withdrawal.id,
        payload: {
          withdrawalId: withdrawal.id,
          completedBy: "operator-1",
          externalReference: "transfer-abc",
        },
      }),
    ]);
  });

  it("rejects completion unless the withdrawal is approved", async () => {
    const { service, withdrawal, complete, releaseOrComplete } = fixture("requested");

    await expect(service.complete("operator-1", withdrawal.id)).rejects.toThrow(
      "Invalid withdrawal transition from requested",
    );
    expect(complete).not.toHaveBeenCalled();
    expect(releaseOrComplete).not.toHaveBeenCalled();
  });

  it("allows an approved withdrawal to be rejected without execution-provider state", async () => {
    const { service, withdrawal, releaseOrComplete } = fixture();

    await expect(
      service.reject("operator-1", withdrawal.id, "Operator rejected"),
    ).resolves.toMatchObject({
      state: "rejected",
    });
    expect(releaseOrComplete).toHaveBeenCalledWith({
      withdrawalId: withdrawal.id,
      accountId: withdrawal.accountId,
      kind: "released",
      correlationId: withdrawal.correlationId,
    });
  });
});
