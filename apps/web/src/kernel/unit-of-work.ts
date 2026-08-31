export interface UnitOfWork {
  transaction<T>(operation: () => Promise<T>): Promise<T>;
}
