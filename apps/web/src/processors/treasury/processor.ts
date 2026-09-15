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
    return this.treasury.create({
      id: newId(),
      direction: "credit",
      amountMinor: BigInt(row.amountMinor),
      title: "Platform allocation",
      note: "Automatic allocation from completed purchase distribution",
      sourceKind: "distribution",
      sourceId: row.id,
      idempotencyKey: `treasury:distribution:${row.id}:platform`,
      actorId: null,
      createdAt: new Date(),
    });
  }
}
