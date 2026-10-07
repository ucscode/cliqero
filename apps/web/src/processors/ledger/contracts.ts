export interface MaturedLedgerEntry {
  id: string;
  relationalId: string;
  accountId: string | null;
  amountMinor: string;
  entryType: string;
  recipientRole: string | null;
  correlationId: string;
}

export interface SettlementStore {
  claimMatured(input: { now: Date; batchSize: number }): Promise<readonly MaturedLedgerEntry[]>;
  recordSettlements(entries: readonly MaturedLedgerEntry[], settledAt: Date): Promise<number>;
}
