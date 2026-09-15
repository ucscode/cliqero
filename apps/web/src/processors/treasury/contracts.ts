export interface TreasuryDistributionStore {
  findWork(limit: number): Promise<Array<{ id: string }>>;
  findAmount(distributionId: string): Promise<{ id: string; amountMinor: string } | null>;
}
