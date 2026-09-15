export interface WithdrawalPayoutState {
  state: string;
  attemptState: string | null;
}

export interface WithdrawalPersistence {
  withIdempotencyLock<T>(idempotencyKey: string, operation: () => Promise<T>): Promise<T>;
  findPayoutState(withdrawalId: string): Promise<WithdrawalPayoutState | null>;
}
