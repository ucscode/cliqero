import { describe, expect, it, vi } from "vitest";
import { WithdrawalService } from "@/application/withdrawal/service";
import { Money } from "@/modules/money/money";
import type { LedgerFundsReservationService } from "@/modules/ledger/reservations";
import type { Withdrawal } from "@/modules/withdrawal/withdrawal";
import type { WithdrawalIdempotencyMatch } from "@/modules/withdrawal/withdrawal";

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
  const releaseOrComplete = vi.fn<LedgerFundsReservationService["releaseOrComplete"]>(
    async () => undefined,
  );
  const append = vi.fn(async () => undefined);
  const requireCapability = vi.fn(async () => undefined);
  const findByIdempotencyKey = vi.fn<
    (accountId: string, key: string) => Promise<WithdrawalIdempotencyMatch | null>
  >(async () => null);
  let payoutInitiation:
    import("@/modules/withdrawal/withdrawal").WithdrawalPayoutInitiationRecord | null = null;
  let payoutFailure:
    import("@/modules/withdrawal/withdrawal").WithdrawalPayoutFailureRecord | null = null;
  const recordPayoutInitiation = vi.fn(
    async (record: Omit<NonNullable<typeof payoutInitiation>, "createdAt">) => {
      payoutInitiation = { ...record, createdAt: new Date("2026-02-01T00:00:00Z") };
    },
  );
  const findPayoutInitiationByIdempotencyKey = vi.fn(async (key: string) =>
    payoutInitiation?.idempotencyKey === key ? payoutInitiation : null,
  );
  const findPayoutInitiationByWithdrawalId = vi.fn(async (id: string) =>
    payoutInitiation?.withdrawalId === id ? payoutInitiation : null,
  );
  const recordPayoutFailure = vi.fn(
    async (record: Omit<NonNullable<typeof payoutFailure>, "createdAt">) => {
      payoutFailure = { ...record, createdAt: new Date("2026-02-02T00:00:00Z") };
    },
  );
  const findPayoutFailureByIdempotencyKey = vi.fn(async (key: string) =>
    payoutFailure?.idempotencyKey === key ? payoutFailure : null,
  );
  const findPayoutFailureByWithdrawalId = vi.fn(async (id: string) =>
    payoutFailure?.withdrawalId === id ? payoutFailure : null,
  );
  const update = vi.fn(async () => undefined);
  const markPayoutFailed = vi.fn(async () => undefined);
  let payoutReturn: import("@/modules/withdrawal/withdrawal").WithdrawalPayoutReturnRecord | null =
    null;
  const recordPayoutReturn = vi.fn(
    async (
      record: Omit<NonNullable<typeof payoutReturn>, "idempotencyKey"> & { idempotencyKey: string },
    ) => {
      payoutReturn = record;
    },
  );
  const findPayoutReturnByIdempotencyKey = vi.fn(async () => payoutReturn);
  const settleInflow = vi.fn(async () => ({ entry: null, changed: false, settledMinor: 0n }));
  const requireNoOutstandingUnderLock = vi.fn(async () => undefined);
  const service = new WithdrawalService(
    {
      findById: async () => withdrawal,
      findByIdForUpdate: async () =>
        withdrawalForUpdate === undefined ? withdrawal : withdrawalForUpdate,
      findByIdempotencyKey,
      listForAccount: async () => ({ items: [], nextCursor: null }),
      listForOperator: async () => [],
      create,
      update,
      delete: async () => undefined,
      complete,
      recordPayoutReturn,
      findPayoutReturnByIdempotencyKey,
      findPayoutReturnByWithdrawalId: async () => null,
      lockPayoutReturnKey: async () => undefined,
      markPayoutReturned: vi.fn(async () => undefined),
      lockPayoutInitiationKey: vi.fn(async () => undefined),
      findPayoutInitiationByIdempotencyKey,
      findPayoutInitiationByWithdrawalId,
      recordPayoutInitiation,
      lockPayoutFailureKey: vi.fn(async () => undefined),
      findPayoutFailureByIdempotencyKey,
      findPayoutFailureByWithdrawalId,
      recordPayoutFailure,
      markPayoutFailed,
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
      recordPayoutReturn: vi.fn(async () => undefined),
      resize: async () => undefined,
      remove: async () => undefined,
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
    {
      settleInflow,
      requireNoOutstanding: vi.fn(async () => undefined),
      requireNoOutstandingUnderLock,
    } as any,
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
    findByIdempotencyKey,
    recordPayoutReturn,
    findPayoutReturnByIdempotencyKey,
    findPayoutInitiationByIdempotencyKey,
    findPayoutInitiationByWithdrawalId,
    recordPayoutInitiation,
    findPayoutFailureByIdempotencyKey,
    recordPayoutFailure,
    markPayoutFailed,
    update,
    settleInflow,
    requireNoOutstandingUnderLock,
  };
}

describe("WithdrawalService idempotency intent", () => {
  it("checks account debt under the account lock before approving a requested withdrawal", async () => {
    const { service, requireNoOutstandingUnderLock } = fixture("requested");
    requireNoOutstandingUnderLock.mockRejectedValue(
      Object.assign(new Error("Outstanding debt blocks withdrawal."), {
        code: "account_debt_blocks_operation",
      }),
    );

    await expect(
      service.update("operator-1", "withdrawal-1", { state: "approved" }),
    ).rejects.toMatchObject({
      code: "account_debt_blocks_operation",
    });
    expect(requireNoOutstandingUnderLock).toHaveBeenCalledWith("account-1", "withdrawal");
  });

  it("matches equivalent normalized intent while rejecting state or reason changes", async () => {
    const { service, withdrawal, findByIdempotencyKey } = fixture();
    findByIdempotencyKey.mockResolvedValue({
      withdrawal: { ...withdrawal, state: "approved", reason: "Changed later" },
      initialState: "requested",
      initialReason: null,
    });
    const same = await service.create({
      accountId: "account-1",
      amountMinor: 2500n,
      currency: "USD",
      destinationId: "destination-1",
      idempotencyKey: "key-1",
      correlationId: "retry-correlation",
      initialReason: "   ",
    });
    expect(same.state).toBe("approved");
    await expect(
      service.create({
        accountId: "account-1",
        amountMinor: 2500n,
        currency: "USD",
        destinationId: "destination-1",
        idempotencyKey: "key-1",
        correlationId: "retry-correlation",
        initialState: "approved",
      }),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
    findByIdempotencyKey.mockResolvedValue({
      withdrawal,
      initialState: "requested",
      initialReason: "original reason",
    });
    await expect(
      service.create({
        accountId: "account-1",
        amountMinor: 2500n,
        currency: "USD",
        destinationId: "destination-1",
        idempotencyKey: "key-1",
        correlationId: "retry-correlation",
        initialReason: "different reason",
      }),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
  });
});

describe("WithdrawalService payout return recovery", () => {
  it("restores a completed payout through reservation recovery, Treasury reversal, and debt settlement idempotently", async () => {
    const { service, withdrawal, recordPayoutReturn, settleInflow, treasuryCreate, auditRecord } =
      fixture("completed");
    const input = {
      amountMinor: "2375",
      reason: "Receiving bank returned the payout",
      externalReference: "bank-return-42",
      idempotencyKey: "return-42",
    };
    const result = await service.recordPayoutReturn("operator-1", withdrawal.id, input);
    expect(result.changed).toBe(true);
    expect(result.payoutReturn.restoredMinor).toBe(2500n);
    expect(recordPayoutReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 2375n,
        restoredMinor: 2500n,
        correlationId: expect.any(String),
      }),
    );
    const correctionCorrelationId = recordPayoutReturn.mock.calls[0]![0].correlationId;
    expect(correctionCorrelationId).not.toBe(withdrawal.correlationId);
    expect(settleInflow).toHaveBeenCalledWith(
      expect.objectContaining({
        incomingMinor: 2500n,
        sourceKind: "payout_return",
        wallet: "earnings",
        correlationId: correctionCorrelationId,
      }),
    );
    expect(treasuryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: "debit",
        amountMinor: 125n,
        sourceKind: "withdrawal_fee_reversal",
        correlationId: correctionCorrelationId,
      }),
    );
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: correctionCorrelationId }),
    );
  });

  it("rejects a payout return whose idempotency key is reused for different intent", async () => {
    const { service, findPayoutReturnByIdempotencyKey } = fixture("completed");
    findPayoutReturnByIdempotencyKey.mockResolvedValue({
      id: "return-id",
      withdrawalId: "other-withdrawal",
      amountMinor: 2375n,
      restoredMinor: 2500n,
      reason: "other",
      externalReference: "other-ref",
      actorId: "operator-1",
      correlationId: "correlation-1",
      idempotencyKey: "return-42",
    });
    await expect(
      service.recordPayoutReturn("operator-1", "withdrawal-1", {
        amountMinor: "2375",
        reason: "Receiving bank returned the payout",
        externalReference: "bank-return-42",
        idempotencyKey: "return-42",
      }),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
  });
});

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
        actorKind: "customer",
        idempotencyKey: `withdrawal:${withdrawal.id}:fee:request:withdrawal-correlation`,
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
      auditRecord,
    } = fixture();

    await service.initiatePayout("operator-1", withdrawal.id, { idempotencyKey: "init-1" });
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
    const operationCorrelationId = releaseOrComplete.mock.calls[0]![0].correlationId;
    expect(operationCorrelationId).not.toBe(withdrawal.correlationId);
    expect(releaseOrComplete).toHaveBeenCalledWith({
      withdrawalId: withdrawal.id,
      accountId: withdrawal.accountId,
      kind: "completed",
      correlationId: operationCorrelationId,
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
        correlationId: operationCorrelationId,
        payload: {
          withdrawalId: withdrawal.id,
          completedBy: "operator-1",
          externalReference: "transfer-abc",
        },
      }),
    ]);
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: operationCorrelationId }),
    );
  });

  it("keeps cancellation as a command that releases funds, reverses fees, and emits an event", async () => {
    const { service, withdrawal, releaseOrComplete, append, treasuryCreate, auditRecord } =
      fixture("requested");

    await expect(service.cancel("account-1", withdrawal.id)).resolves.toMatchObject({
      state: "cancelled",
    });
    const operationCorrelationId = releaseOrComplete.mock.calls[0]![0].correlationId;
    expect(operationCorrelationId).not.toBe(withdrawal.correlationId);
    expect(releaseOrComplete).toHaveBeenCalledWith({
      withdrawalId: withdrawal.id,
      accountId: withdrawal.accountId,
      kind: "released",
      correlationId: operationCorrelationId,
    });
    expect(treasuryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: "debit",
        amountMinor: withdrawal.fee?.minorAmount,
        sourceKind: "withdrawal_fee_reversal",
        correlationId: operationCorrelationId,
      }),
    );
    expect(append).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "withdrawal.cancelled",
        aggregateId: withdrawal.id,
        correlationId: operationCorrelationId,
      }),
    ]);
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: operationCorrelationId }),
    );
  });

  it("rejects completion unless the withdrawal is approved", async () => {
    const { service, withdrawal, complete, releaseOrComplete } = fixture("requested");

    await expect(service.complete("operator-1", withdrawal.id)).rejects.toThrow(
      "Only approved withdrawals can be completed; this one is requested.",
    );
    expect(complete).not.toHaveBeenCalled();
    expect(releaseOrComplete).not.toHaveBeenCalled();
  });

  it("requires initiation evidence before completion", async () => {
    const { service, withdrawal, complete, releaseOrComplete } = fixture();
    await expect(service.complete("operator-1", withdrawal.id)).rejects.toMatchObject({
      code: "payout_not_initiated",
    });
    expect(complete).not.toHaveBeenCalled();
    expect(releaseOrComplete).not.toHaveBeenCalled();
  });

  it("blocks initiation under debt while preserving approval and reservation", async () => {
    const {
      service,
      withdrawal,
      requireNoOutstandingUnderLock,
      recordPayoutInitiation,
      releaseOrComplete,
    } = fixture();
    requireNoOutstandingUnderLock.mockRejectedValue(
      Object.assign(new Error("Outstanding debt blocks withdrawal."), {
        code: "account_debt_blocks_operation",
      }),
    );
    await expect(
      service.initiatePayout("operator-1", withdrawal.id, { idempotencyKey: "payout-init-1" }),
    ).rejects.toMatchObject({ code: "account_debt_blocks_operation" });
    expect(recordPayoutInitiation).not.toHaveBeenCalled();
    expect(releaseOrComplete).not.toHaveBeenCalled();
    expect(withdrawal.state).toBe("approved");
    expect(requireNoOutstandingUnderLock).toHaveBeenCalledWith("account-1", "withdrawal");
  });

  it("records authorized initiation idempotently and blocks a second key", async () => {
    const { service, withdrawal, recordPayoutInitiation, findPayoutInitiationByIdempotencyKey } =
      fixture();
    const input = { idempotencyKey: "init-key", externalReference: "bank-batch-4" };
    const first = await service.initiatePayout("operator-1", withdrawal.id, input);
    const replay = await service.initiatePayout("operator-1", withdrawal.id, input);
    expect(first.changed).toBe(true);
    expect(replay).toMatchObject({ changed: false, initiation: first.initiation });
    expect(recordPayoutInitiation).toHaveBeenCalledTimes(1);
    await expect(
      service.initiatePayout("operator-1", withdrawal.id, {
        idempotencyKey: "another-key",
        externalReference: "bank-batch-4",
      }),
    ).rejects.toMatchObject({ code: "payout_already_initiated" });
    await expect(
      service.initiatePayout("operator-1", withdrawal.id, {
        idempotencyKey: "init-key",
        externalReference: "different-intent",
      }),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
    expect(findPayoutInitiationByIdempotencyKey).toHaveBeenCalled();
  });

  it("records authoritative non-delivery once and releases the reservation atomically", async () => {
    const { service, withdrawal, recordPayoutFailure, markPayoutFailed, releaseOrComplete } =
      fixture();
    await service.initiatePayout("operator-1", withdrawal.id, { idempotencyKey: "init-fail" });
    const input = {
      reason: "Bank confirmed rejected before delivery",
      externalReference: "bank-reject-4",
      idempotencyKey: "failure-4",
    };
    const result = await service.recordPayoutFailure("operator-1", withdrawal.id, input);
    const retry = await service.recordPayoutFailure("operator-1", withdrawal.id, input);
    expect(result.changed).toBe(true);
    expect(retry).toMatchObject({ changed: false, failure: result.failure });
    expect(recordPayoutFailure).toHaveBeenCalledTimes(1);
    expect(markPayoutFailed).toHaveBeenCalledWith(withdrawal.id, input.reason);
    expect(releaseOrComplete).toHaveBeenCalledTimes(1);
    expect(releaseOrComplete).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "released", withdrawalId: withdrawal.id }),
    );
  });

  it("requires withdrawal management authorization for initiation and completion", async () => {
    const { service, withdrawal, requireCapability, recordPayoutInitiation } = fixture();
    requireCapability.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(
      service.initiatePayout("customer-1", withdrawal.id, { idempotencyKey: "no-access" }),
    ).rejects.toThrow("Forbidden");
    expect(recordPayoutInitiation).not.toHaveBeenCalled();
    requireCapability.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(service.complete("customer-1", withdrawal.id)).rejects.toThrow("Forbidden");
  });

  it("allows an approved withdrawal to be rejected without execution-provider state", async () => {
    const { service, withdrawal, releaseOrComplete, append, auditRecord } = fixture();

    await expect(
      service.update("operator-1", withdrawal.id, {
        state: "rejected",
        reason: "Operator rejected",
      }),
    ).resolves.toMatchObject({
      state: "rejected",
    });
    const operationCorrelationId = releaseOrComplete.mock.calls[0]![0].correlationId;
    expect(operationCorrelationId).not.toBe(withdrawal.correlationId);
    expect(releaseOrComplete).toHaveBeenCalledWith({
      withdrawalId: withdrawal.id,
      accountId: withdrawal.accountId,
      kind: "released",
      correlationId: operationCorrelationId,
    });
    expect(append).toHaveBeenCalledWith([
      expect.objectContaining({ correlationId: operationCorrelationId }),
    ]);
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: operationCorrelationId }),
    );
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
