export type TransactionPinAttempt = "valid" | "invalid" | "locked" | "missing";

export interface TransactionPinRepository {
  exists(accountId: string): Promise<boolean>;
  set(accountId: string, hash: string, onlyIfMissing?: boolean): Promise<boolean>;
  verify(
    accountId: string,
    pin: string,
    verifyHash: (pin: string, hash: string) => Promise<boolean>,
  ): Promise<TransactionPinAttempt>;
  change(
    accountId: string,
    currentPin: string,
    nextHash: string,
    verifyHash: (pin: string, hash: string) => Promise<boolean>,
  ): Promise<TransactionPinAttempt>;
}

export interface TransactionPinHasher {
  hashTransactionPin(pin: string): Promise<string>;
  verifyTransactionPin(pin: string, hash: string): Promise<boolean>;
}
