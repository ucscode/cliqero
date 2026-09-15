import type { SettlementPolicyRepository, SettlementResult } from "@/modules/ledger/settlement";
import type { SettlementStore } from "@/processors/ledger/contracts";

export class SettlementProcessor {
  constructor(
    private readonly store: SettlementStore,
    private readonly policy: SettlementPolicyRepository,
  ) {}

  async settle(input: { now?: Date; batchSize?: number } = {}): Promise<SettlementResult> {
    const policy = await this.policy.getActive();
    if (policy.defaultBalanceState !== "pending") return { claimed: 0, settled: 0 };
    const batchSize = input.batchSize ?? 100;
    if (batchSize < 1 || batchSize > 1000) throw new Error("Invalid settlement batch size");
    return this.store.settleMatured({ now: input.now ?? new Date(), batchSize });
  }
}
