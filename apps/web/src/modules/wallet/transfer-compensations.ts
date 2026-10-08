import type { Id } from "@/kernel/ids";
import type { WalletName } from "@/modules/wallet/wallet";

export interface WalletTransferCompensation {
  id: Id;
  transferId: Id;
  accountId: Id;
  fromWallet: WalletName;
  toWallet: WalletName;
  grossMinor: bigint;
  feeMinor: bigint;
  netMinor: bigint;
  reason: string;
  recovery: {
    destinationWalletMinor: bigint;
    sourceWalletMinor: bigint;
    feeRefundedMinor: bigint;
    debtMinor: bigint;
  };
  createdBy: Id;
  correlationId: Id;
  idempotencyKey: string;
  createdAt: Date;
}

export interface WalletTransferCompensationRepository {
  lockAccount(accountId: Id): Promise<void>;
  lockIdempotencyKey(key: string): Promise<void>;
  findTransfer(id: Id): Promise<{
    id: Id;
    accountId: Id;
    fromWallet: WalletName;
    toWallet: WalletName;
    grossMinor: bigint;
    feeMinor: bigint;
    netMinor: bigint;
  } | null>;
  lockTransfer(id: Id): Promise<void>;
  findByIdempotencyKey(key: string): Promise<WalletTransferCompensation | null>;
  findByTransferId(transferId: Id): Promise<WalletTransferCompensation | null>;
  findById(id: Id): Promise<WalletTransferCompensation | null>;
  list(input: {
    accountId?: Id;
    transferId?: Id;
    cursor?: string;
    limit: number;
  }): Promise<{ items: readonly WalletTransferCompensation[]; nextCursor: string | null }>;
  lockTreasuryBalance(): Promise<void>;
  treasuryBalance(): Promise<bigint>;
  create(compensation: WalletTransferCompensation): Promise<WalletTransferCompensation>;
}
