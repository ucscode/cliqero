export interface SettlementPolicy {
  defaultBalanceState: "pending" | "available";
  settlementDelaySeconds: number;
}

export interface SettlementPolicyRepository {
  getActive(): Promise<SettlementPolicy>;
}

export interface SettlementResult {
  claimed: number;
  settled: number;
}
