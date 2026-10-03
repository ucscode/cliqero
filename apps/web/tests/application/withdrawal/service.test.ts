import { describe, expect, it, vi } from "vitest";
import { WithdrawalService } from "@/application/withdrawal/service";
import { Money } from "@/modules/money/money";
import type { Withdrawal } from "@/modules/withdrawal/withdrawal";

function fixture(
  state: Withdrawal["state"] = "approved",
  limits: { minimum: bigint; maximum: bigint | null } = { minimum: 1n, maximum: null },
  withdrawalForUpdate: Withdrawal | null | undefined = undefined,
) {
  const withdrawal: Withdrawal = {
    id: "withdrawal-1",
    accountId: "account-1",
    amount: Money.of(2500n, "USD"),
    fee: Money.of(125n, "USD"),
    netAmount: Money.of(2375n, "USD"),
    destination: {
      savedDestinationId: "destination-1",
      method: "bank_ng",
      methodName: "Bank account",
      name: "Primary",
      fields: [],
    },
    state,
    idempotencyKey: "key-1",
    correlationId: "correlation-1",
    reason: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
  const completedAt = new Date("2026-02-01T00:00:00Z");
  const complete = vi.fn(async () => completedAt);
  const create = vi.fn(async () => undefined);
  const reserve = vi.fn(async () => ({
    id: "reservation-1",
    withdrawalId: withdrawal.id,
    accountId: withdrawal.accountId,
    amount: withdrawal.amount,
  }));
  const treasuryCreate = vi.fn(async () => undefined);
  const auditRecord = vi.fn(async () => undefined);
  const releaseOrComplete = vi.fn(async () => undefined);
  const append = vi.fn(async () => undefined);
  const requireCapability = vi.fn(async () => undefined);
  const service = new WithdrawalService(
    {
      findById: async () => withdrawal,
      findByIdForUpdate: async () =>
        withdrawalForUpdate === undefined ? withdrawal : withdrawalForUpdate,
      findByIdempotencyKey: async () => null,
      listForAccount: async () => ({ items: [], nextCursor: null }),
      listForOperator: async () => [],
      create,
      update: async () => undefined,
      delete: async () => undefined,
      deleteForRoot: async () => undefined,
      complete,
    },
    {
      getActive: async () => ({
        minimumAmount: Money.of(limits.minimum, "USD"),
        maximumAmount: limits.maximum === null ? null : Money.of(limits.maximum, "USD"),
        enabled: true,
      }),
    },
    {
      reserve,
      available: async () => 0n,
      releaseOrComplete,
      resize: async () => undefined,
      remove: async () => undefined,
      removeForRoot: async () => undefined,
      summarize: async () => [],
    },
    { append },
    { transaction: async (operation) => operation() },
    {
      capabilities: async () => [],
      hasCapability: async () => false,
      requireCapability,
    },
    { withIdempotencyLock: async (_accountId, _key, operation) => operation() },
    { resolveForWithdrawal: async () => withdrawal.destination } as any,
    {
      getActive: () => ({
        enabled: true,
        withdrawal: { enabled: true, basisPoints: 500n, maximumMinor: 2_000n },
        funding_to_earning: { enabled: true, basisPoints: 200n, maximumMinor: 1_000n },
        earning_to_funding: { enabled: true, basisPoints: 100n, maximumMinor: 500n },
      }),
    },
    { create: treasuryCreate, findByIdempotencyKey: async () => null } as any,
    { record: auditRecord },
  );
  return {
    service,
    withdrawal,
    complete,
    releaseOrComplete,
    append,
    requireCapability,
    create,
    reserve,
    treasuryCreate,
    auditRecord,
  };
}

describe("WithdrawalService request fees", () => {
  it("snapshots gross, capped fee, and net and credits Treasury at request time", async () => {
    const { service, create, reserve, treasuryCreate } = fixture();
    const withdrawal = await service.create({
      accountId: "account-1",
      amountMinor: 50_000n,
      currency: "USD",
      destinationId: "destination-1",
      idempotencyKey: "fee-snapshot",
      correlationId: "withdrawal-correlation",
    });

    expect(withdrawal.amount.minorAmount).toBe(50_000n);
    expect(withdrawal.fee?.minorAmount).toBe(2_000n);
    expect(withdrawal.netAmount?.minorAmount).toBe(48_000n);
    expect(create).toHaveBeenCalledWith(withdrawal);
    expect(reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: withdrawal.amount,
        correlationId: "withdrawal-correlation",
      }),
    );
    expect(treasuryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: "credit",
        amountMinor: 2_000n,
        sourceKind: "withdrawal_fee",
        sourceId: withdrawal.id,
        correlationId: "withdrawal-correlation",
        idempotencyKey: `withdrawal:${withdrawal.id}:fee:request:2000`,
      }),
    );
  });
});

describe("WithdrawalService manual completion", () => {
  it("records completion facts and completes the reserved funds once", async () => {
    const {
      service,
      withdrawal,
      complete,
      releaseOrComplete,
      append,
      requireCapability,
      treasuryCreate,
    } = fixture();

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
    expect(treasuryCreate).not.toHaveBeenCalled();
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
      service.update("operator-1", withdrawal.id, {
        state: "rejected",
        reason: "Operator rejected",
      }),
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

describe("WithdrawalService policy enforcement", () => {
  it("enforces configured minimum and maximum amounts server-side", async () => {
    const belowMinimum = fixture("requested", { minimum: 1000n, maximum: 5000n });
    await expect(
      belowMinimum.service.create({
        accountId: "account-1",
        amountMinor: 999n,
        currency: "USD",
        destinationId: "destination-1",
        idempotencyKey: "below-minimum",
        correlationId: "correlation",
      }),
    ).rejects.toThrow("below the minimum");
    const aboveMaximum = fixture("requested", { minimum: 1000n, maximum: 5000n });
    await expect(
      aboveMaximum.service.create({
        accountId: "account-1",
        amountMinor: 5001n,
        currency: "USD",
        destinationId: "destination-1",
        idempotencyKey: "above-maximum",
        correlationId: "correlation",
      }),
    ).rejects.toThrow("exceeds the maximum");
  });

  it("returns a public not-found error when cancellation targets a missing withdrawal", async () => {
    const { service } = fixture("requested", { minimum: 1n, maximum: null }, null);

    await expect(service.cancel("account-1", "missing-withdrawal")).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });
});
