export interface WithdrawalPersistence {
  withIdempotencyLock<T>(
    accountId: string,
    idempotencyKey: string,
    operation: () => Promise<T>,
  ): Promise<T>;
}
