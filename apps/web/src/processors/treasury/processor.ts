import { newId } from "@/kernel/ids";
import type { TreasuryRepository } from "@/modules/treasury/treasury";
import type { TreasuryDistributionStore } from "@/processors/treasury/contracts";

export class TreasuryProcessor {
  constructor(
    private readonly store: TreasuryDistributionStore,
    private readonly treasury: TreasuryRepository,
  ) {}

  findWork(limit = 50) {
    return this.store.findWork(limit);
  }

  async process(distributionId: string) {
    const row = await this.store.findAmount(distributionId);
    if (!row || BigInt(row.amountMinor) <= 0n) return null;
    const idempotencyKey = `treasury:distribution:${row.id}:platform`;
    const existing = await this.treasury.findByIdempotencyKey(idempotencyKey);
    if (existing) return existing;
    if (!row.correlationId)
      throw new Error(
        `Distribution ${row.id} has no persisted correlation ID; Treasury attribution cannot be inferred safely`,
      );
    return this.treasury.create({
      id: newId(),
      direction: "credit",
      amountMinor: BigInt(row.amountMinor),
      title: "Platform allocation",
      note: "Automatic allocation from completed purchase distribution",
      sourceKind: "distribution",
      sourceId: row.id,
      idempotencyKey,
      actorId: null,
      actorKind: "system",
      correlationId: row.correlationId,
      createdAt: new Date(),
    });
  }
}
