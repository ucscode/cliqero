export interface IdempotencyStore {
  begin(scope: string, key: string): Promise<boolean>;
  complete(scope: string, key: string, resultReference: string, response?: unknown): Promise<void>;
  fail(scope: string, key: string, error: string): Promise<void>;
  findCompleted(
    scope: string,
    key: string,
  ): Promise<{
    resultReference: string | null;
    response: unknown;
  } | null>;
}
