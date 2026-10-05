import { describe, expect, it, vi } from "vitest";
import { FundingCreditReconciliationService } from "@/application/funding/reconciliation";

const fundingId = "00000000-0000-4000-8000-000000000001";
const creditId = "00000000-0000-4000-8000-000000000002";

describe("FundingCreditReconciliationService", () => {
  it("uses the normal processors once and returns the stored idempotent result", async () => {
    const records = new Map<string, { id: string; response?: unknown }>();
    const idempotency = {
      begin: vi.fn(async (scope: string, key: string) => {
        const identity = `${scope}:${key}`;
        if (records.has(identity)) return false;
        records.set(identity, { id: fundingId });
        return true;
      }),
      findCompleted: vi.fn(async (scope: string, key: string) => {
        const record = records.get(`${scope}:${key}`);
        return record?.response === undefined
          ? null
          : { resultReference: record.id, response: record.response };
      }),
      complete: vi.fn(
        async (scope: string, key: string, resultReference: string, response: unknown) => {
          records.set(`${scope}:${key}`, { id: resultReference, response });
        },
      ),
      fail: vi.fn(),
    };
    const resultCredit = { id: creditId, state: "pending" };
    const funding = {
      findById: vi.fn(async () => ({ id: fundingId, state: "confirmed" })),
    };
    const wallet = {
      findCreditByFunding: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: creditId, state: "available" }),
    };
    const creditProcessor = { process: vi.fn(async () => resultCredit) };
    const availabilityProcessor = { process: vi.fn(async () => true) };
    const audit = { record: vi.fn(async () => undefined) };
    const service = new FundingCreditReconciliationService(
      funding as never,
      wallet as never,
      creditProcessor as never,
      availabilityProcessor as never,
      { requireCapability: vi.fn(async () => undefined) } as never,
      idempotency as never,
      audit,
      { transaction: async (operation) => operation() },
    );
    const input = { actorId: "operator", fundingId, idempotencyKey: "repair-1" };

    const first = await service.reconcile(input);
    const repeated = await service.reconcile(input);

    expect(first).toEqual({ fundingId, creditId, state: "available", applied: true });
    expect(repeated).toEqual(first);
    expect(creditProcessor.process).toHaveBeenCalledTimes(1);
    expect(availabilityProcessor.process).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "operator",
        action: "funding.credit.reconciled",
        subjectId: fundingId,
      }),
    );
  });

  it("rejects a reused key whose stored result belongs to another funding", async () => {
    const service = new FundingCreditReconciliationService(
      { findById: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      { requireCapability: vi.fn(async () => undefined) } as never,
      {
        begin: vi.fn(async () => false),
        findCompleted: vi.fn(async () => ({ resultReference: "another-funding", response: {} })),
      } as never,
      {} as never,
      { transaction: async (operation) => operation() },
    );

    await expect(
      service.reconcile({ actorId: "operator", fundingId, idempotencyKey: "reused" }),
    ).rejects.toMatchObject({ code: "idempotency_conflict", status: 409 });
  });
});
