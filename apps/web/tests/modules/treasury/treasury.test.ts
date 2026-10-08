import { describe, expect, it } from "vitest";
import { newId } from "@/kernel/ids";
import {
  TreasuryService,
  type TreasuryEntry,
  type TreasuryRepository,
} from "@/modules/treasury/treasury";

class Fake implements TreasuryRepository {
  items: TreasuryEntry[] = [];
  async create(value: Parameters<TreasuryRepository["create"]>[0]) {
    this.items.push(value);
    return value;
  }
  async createAdjustment(value: Parameters<TreasuryRepository["createAdjustment"]>[0]) {
    const old = this.items.find((entry) => entry.idempotencyKey === value.idempotencyKey);
    if (old) {
      if (old.amountMinor !== (value.amountMinor > 0n ? value.amountMinor : -value.amountMinor))
        throw new Error(
          "Treasury adjustment idempotency key already used for a different adjustment",
        );
      return { entry: old, created: false };
    }
    const entry: TreasuryEntry = {
      id: value.id,
      direction: value.amountMinor > 0n ? "credit" : "debit",
      amountMinor: value.amountMinor > 0n ? value.amountMinor : -value.amountMinor,
      title: "Treasury adjustment",
      note: value.reference ? `${value.reason}\nReference: ${value.reference}` : value.reason,
      sourceKind: "treasury_adjustment",
      sourceId: value.id,
      idempotencyKey: value.idempotencyKey,
      actorId: value.actorId,
      actorKind: "operator",
      correlationId: value.correlationId ?? newId(),
      createdAt: value.createdAt,
    };
    this.items.push(entry);
    return { entry, created: true };
  }
  async findById(id: string) {
    return this.items.find((entry) => entry.id === id) ?? null;
  }
  async findByIdempotencyKey(key: string) {
    return this.items.find((entry) => entry.idempotencyKey === key) ?? null;
  }
  async list() {
    return { items: this.items, nextCursor: null };
  }
  async summary() {
    const creditsMinor = this.items
      .filter((item) => item.direction === "credit")
      .reduce((sum, item) => sum + item.amountMinor, 0n);
    const debitsMinor = this.items
      .filter((item) => item.direction === "debit")
      .reduce((sum, item) => sum + item.amountMinor, 0n);
    return { creditsMinor, debitsMinor, balanceMinor: creditsMinor - debitsMinor };
  }
}

describe("Treasury adjustments", () => {
  it("derives deterministic ledger direction and source from a signed adjustment", async () => {
    const repo = new Fake();
    const service = new TreasuryService(repo);
    const credit = await service.createAdjustment({
      amountMinor: 500n,
      reason: "Correct allocation",
      reference: "CASE-1",
      actorId: "actor",
      idempotencyKey: "adjustment-1",
    });
    expect(credit).toMatchObject({
      direction: "credit",
      amountMinor: 500n,
      title: "Treasury adjustment",
      sourceKind: "treasury_adjustment",
      sourceId: credit.id,
      note: "Correct allocation\nReference: CASE-1",
    });
    const debit = await service.createAdjustment({
      amountMinor: -200n,
      reason: "Reverse over-allocation",
      actorId: "actor",
      idempotencyKey: "adjustment-2",
    });
    expect(debit).toMatchObject({ direction: "debit", amountMinor: 200n });
    expect((await repo.summary()).balanceMinor).toBe(300n);
  });

  it("requires a non-zero amount and reason", async () => {
    const service = new TreasuryService(new Fake());
    await expect(
      service.createAdjustment({
        amountMinor: 0n,
        reason: "reason",
        actorId: "a",
        idempotencyKey: "zero",
      }),
    ).rejects.toThrow("non-zero");
    await expect(
      service.createAdjustment({
        amountMinor: 1n,
        reason: "  ",
        actorId: "a",
        idempotencyKey: "blank",
      }),
    ).rejects.toThrow("reason");
  });

  it("keeps generated adjustment correlation stable on idempotent retry and audit", async () => {
    const repo = new Fake();
    const audits: string[] = [];
    const service = new TreasuryService(repo, undefined, {
      record: async ({ correlationId }) => {
        audits.push(correlationId);
      },
    });
    const input = {
      amountMinor: 25n,
      reason: "Trace correction",
      actorId: "operator",
      idempotencyKey: "trace-adjustment-retry",
    };

    const first = await service.createAdjustment(input);
    const retry = await service.createAdjustment(input);

    expect(retry.id).toBe(first.id);
    expect(retry.correlationId).toBe(first.correlationId);
    expect(audits).toEqual([first.correlationId]);
  });
});
