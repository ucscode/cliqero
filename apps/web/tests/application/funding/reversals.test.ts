import { describe, expect, it, vi } from "vitest";
import { FundingReversalService } from "@/application/funding/reversals";
import { AccountValueRecoveryService } from "@/application/finance/account-value-recovery";
import { Money } from "@/modules/money/money";
import type { FundingReversal, FundingReversalRepository } from "@/modules/funding/reversals";

const funding = {
  id: "10000000-0000-4000-8000-000000000001",
  accountId: "10000000-0000-4000-8000-000000000002",
  providerName: "paystack",
  providerReference: "pay-10000000-0000-4000-8000-000000000001",
  canonicalAmount: Money.of(1000n, "USD"),
  collectionAmount: Money.of(1000n, "USD"),
  state: "confirmed" as const,
  idempotencyKey: "funding-key",
};

function setup() {
  const saved: FundingReversal[] = [];
  const repository = {
    lockAccount: vi.fn(),
    lockIdempotencyKey: vi.fn(),
    findById: async (id) => saved.find((v) => v.id === id) ?? null,
    findByIdempotencyKey: async (key) => saved.find((v) => v.idempotencyKey === key) ?? null,
    list: vi.fn(),
    remaining: vi.fn(
      async () => 1000n - saved.reduce((total, value) => total + BigInt(value.amountMinor), 0n),
    ),
    lockForReversal: vi.fn(
      async (): Promise<Awaited<ReturnType<FundingReversalRepository["lockForReversal"]>>> => ({
        providerOrigin: true,
        state: "confirmed",
        fundingAmountMinor: 1000n,
        collectionAmountMinor: 1000n,
        collectionCurrency: "USD",
        creditAmountMinor: 0n,
        creditState: null,
      }),
    ),
    reducePendingCredit: vi.fn(),
    providerRefundedCollection: vi.fn(async () => 0n),
    availableFunding: async () => 600n,
    availableEarnings: async () => 250n,
    create: async (input) => {
      const result = { ...input, createdAt: new Date() };
      saved.push(result);
      return result;
    },
    summary: vi.fn(),
  } satisfies FundingReversalRepository;
  const debt = { increase: vi.fn(async () => undefined) };
  const service = new FundingReversalService(
    repository,
    { findById: async () => funding, findOriginById: async () => null } as never,
    new AccountValueRecoveryService(repository, debt as never),
    { requireCapability: vi.fn(async () => undefined) } as never,
    { record: vi.fn(async () => undefined) } as never,
    { transaction: async (operation) => operation() },
  );
  return { service, repository, debt, saved };
}

describe("FundingReversalService", () => {
  it("recovers Funding first, Earnings second, then creates only the residual debt", async () => {
    const { service, debt, saved } = setup();
    const result = await service.createByOperator({
      actorId: "10000000-0000-4000-8000-000000000003",
      fundingId: funding.id,
      amountMinor: "1000",
      reason: "Provider chargeback",
      idempotencyKey: "chargeback-1",
    });
    expect(result.recovery).toEqual({
      pendingCreditMinor: "1000",
      fundingWalletMinor: "0",
      earningsWalletMinor: "0",
      debtMinor: "0",
    });
    expect(debt.increase).not.toHaveBeenCalled();
    expect(saved).toHaveLength(1);
  });

  it("uses available allocation before debt when credit was already created", async () => {
    const { service, repository, debt } = setup();
    repository.lockForReversal.mockResolvedValue({
      providerOrigin: true,
      state: "confirmed",
      fundingAmountMinor: 1000n,
      collectionAmountMinor: 1000n,
      collectionCurrency: "USD",
      creditAmountMinor: 1000n,
      creditState: "available",
    });
    const result = await service.createByOperator({
      actorId: "10000000-0000-4000-8000-000000000003",
      fundingId: funding.id,
      amountMinor: "1000",
      reason: "Provider chargeback",
      idempotencyKey: "chargeback-2",
    });
    expect(result.recovery).toEqual({
      pendingCreditMinor: "0",
      fundingWalletMinor: "600",
      earningsWalletMinor: "250",
      debtMinor: "150",
    });
    expect(debt.increase).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 150n, sourceKind: "funding_reversal" }),
    );
  });

  it("rejects amounts beyond the remaining reversible amount", async () => {
    const { service, repository } = setup();
    repository.remaining.mockResolvedValue(0n);
    await expect(
      service.createByOperator({
        actorId: "10000000-0000-4000-8000-000000000003",
        fundingId: funding.id,
        amountMinor: "1",
        reason: "Chargeback",
        idempotencyKey: "too-much",
      }),
    ).rejects.toMatchObject({ code: "funding_reversal_exceeds_remaining", status: 409 });
  });

  it("rejects administrative funding and states without confirmed provider settlement", async () => {
    const { service, repository } = setup();
    repository.lockForReversal.mockResolvedValue({
      providerOrigin: false,
      state: "confirmed",
      fundingAmountMinor: 1000n,
      collectionAmountMinor: 1000n,
      collectionCurrency: "USD",
      creditAmountMinor: 0n,
      creditState: null,
    });
    await expect(
      service.createByOperator({
        actorId: "10000000-0000-4000-8000-000000000003",
        fundingId: funding.id,
        amountMinor: "1",
        reason: "Correction",
        idempotencyKey: "admin-funding",
      }),
    ).rejects.toMatchObject({ code: "provider_funding_required", status: 409 });
    for (const state of [
      "awaiting_payment",
      "verification_pending",
      "reconciliation_pending",
      "failed",
      "cancelled",
      "expired",
    ] as const) {
      repository.lockForReversal.mockResolvedValue({
        providerOrigin: true,
        state,
        fundingAmountMinor: 1000n,
        collectionAmountMinor: 1000n,
        collectionCurrency: "USD",
        creditAmountMinor: 0n,
        creditState: null,
      });
      await expect(
        service.createByOperator({
          actorId: "10000000-0000-4000-8000-000000000003",
          fundingId: funding.id,
          amountMinor: "1",
          reason: "Not settled",
          idempotencyKey: `state-${state}`,
        }),
      ).rejects.toMatchObject({ code: "funding_state_conflict", status: 409 });
    }
  });

  it("resolves administrative funding to the intended conflict and preserves missing as 404", async () => {
    const fundingReader = {
      findById: async () => null,
      findOriginById: async (id: string) => (id === "admin" ? "administrative" : null),
    };
    const repository = {
      lockIdempotencyKey: vi.fn(),
      findByIdempotencyKey: vi.fn(async () => null),
    };
    const instance = new FundingReversalService(
      repository as never,
      fundingReader as never,
      {} as never,
      { requireCapability: vi.fn() } as never,
      { record: vi.fn() } as never,
      { transaction: async (operation) => operation() },
    );
    await expect(
      instance.createByOperator({
        actorId: "actor",
        fundingId: "admin",
        amountMinor: "1",
        reason: "attempt",
        idempotencyKey: "admin-origin",
      }),
    ).rejects.toMatchObject({ code: "provider_funding_required", status: 409 });
    await expect(
      instance.createByOperator({
        actorId: "actor",
        fundingId: "missing",
        amountMinor: "1",
        reason: "attempt",
        idempotencyKey: "missing-origin",
      }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("routes fully unavailable recovery to explicit account debt", async () => {
    const { service, repository, debt } = setup();
    repository.lockForReversal.mockResolvedValue({
      providerOrigin: true,
      state: "confirmed",
      fundingAmountMinor: 1000n,
      collectionAmountMinor: 1000n,
      collectionCurrency: "USD",
      creditAmountMinor: 1000n,
      creditState: "available",
    });
    repository.availableFunding = async () => 0n;
    repository.availableEarnings = async () => 0n;
    const result = await service.createByOperator({
      actorId: "10000000-0000-4000-8000-000000000003",
      fundingId: funding.id,
      amountMinor: "1000",
      reason: "Spent provider funds",
      idempotencyKey: "spent-funds",
    });
    expect(result.recovery).toEqual({
      pendingCreditMinor: "0",
      fundingWalletMinor: "0",
      earningsWalletMinor: "0",
      debtMinor: "1000",
    });
    expect(debt.increase).toHaveBeenCalledWith(
      expect.objectContaining({
        wallet: "account",
        sourceKind: "funding_reversal",
        amountMinor: 1000n,
        idempotencyKey: `debt-increase:funding-reversal:${result.id}`,
      }),
    );
  });
});
