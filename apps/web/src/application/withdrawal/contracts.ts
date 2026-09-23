export interface WithdrawalPersistence {
  withIdempotencyLock<T>(idempotencyKey: string, operation: () => Promise<T>): Promise<T>;
}
