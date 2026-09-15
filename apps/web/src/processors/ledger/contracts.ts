import type { SettlementResult } from "@/modules/ledger/settlement";

export interface SettlementStore {
  settleMatured(input: { now: Date; batchSize: number }): Promise<SettlementResult>;
}
