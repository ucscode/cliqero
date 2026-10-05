export type AccountDebtKind = "increase" | "settlement" | "write_off";
export type AccountDebtWallet = "funding" | "earnings" | "account";
export type AccountDebtActor = { kind: "account"; id: string } | { kind: "system"; id: string };

export type AccountDebtEntry = {
  id: string;
  accountId: string;
  kind: AccountDebtKind;
  amountMinor: bigint;
  wallet: AccountDebtWallet;
  sourceKind: string;
  sourceId: string;
  reason: string;
  actor: AccountDebtActor;
  correlationId: string;
  idempotencyKey: string;
  createdAt: Date;
};

export type AccountDebtDraft = Omit<AccountDebtEntry, "createdAt"> & {
  requestFingerprint: string;
};

/** Persistence boundary for the authoritative, append-only account receivable history. */
export interface AccountDebtRepository {
  lockAccount(accountId: string): Promise<void>;
  balance(accountId: string): Promise<bigint>;
  findByIdempotencyKey(
    key: string,
  ): Promise<(AccountDebtEntry & { requestFingerprint: string }) | null>;
  append(entry: AccountDebtDraft): Promise<AccountDebtEntry>;
  list(accountId: string, limit: number, before?: string): Promise<readonly AccountDebtEntry[]>;
}
