import { newId } from "@/kernel/ids";
import { PublicApplicationError } from "@/kernel/errors";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { AuditRecorder } from "@/application/shared/audit";
import type { AccountDebtService } from "@/application/finance/account-debt";
import type { LedgerFundsReservationService } from "@/modules/ledger/reservations";
import type { WalletService } from "@/application/wallet/service";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import type {
  WalletTransferCompensation,
  WalletTransferCompensationRepository,
} from "@/modules/wallet/transfer-compensations";

export class WalletTransferCompensationService {
  constructor(
    private readonly repository: WalletTransferCompensationRepository,
    private readonly wallet: Pick<WalletService, "summary">,
    private readonly earnings: Pick<LedgerFundsReservationService, "available">,
    private readonly debt: AccountDebtService,
    private readonly operators: OperatorAuthorizationService,
    private readonly audit: AuditRecorder,
    private readonly uow: UnitOfWork,
  ) {}

  async createByOperator(input: {
    actorId: string;
    transferId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<WalletTransferCompensation> {
    await this.operators.requireCapability(input.actorId, "finance.manage");
    const reason = input.reason.trim();
    const key = input.idempotencyKey.trim();
    if (!reason || reason.length > 1000)
      throw new PublicApplicationError(
        "A valid compensation reason is required.",
        "invalid_input",
        400,
      );
    if (!key || key.length > 200)
      throw new PublicApplicationError(
        "A valid Idempotency-Key is required.",
        "invalid_idempotency_key",
        400,
      );

    return this.uow.transaction(async () => {
      const observed = await this.repository.findTransfer(input.transferId);
      if (!observed)
        throw new PublicApplicationError("Wallet transfer not found.", "not_found", 404);

      // Shared account lock is always acquired before row/idempotency/Treasury locks.
      await this.repository.lockAccount(observed.accountId);
      await this.repository.lockTransfer(input.transferId);
      await this.repository.lockIdempotencyKey(key);

      const prior = await this.repository.findByIdempotencyKey(key);
      if (prior) {
        if (prior.transferId !== input.transferId || prior.reason !== reason)
          throw new PublicApplicationError(
            "Idempotency key conflicts with a different compensation request.",
            "idempotency_conflict",
            409,
          );
        return prior;
      }
      if (await this.repository.findByTransferId(input.transferId))
        throw new PublicApplicationError(
          "This wallet transfer has already been compensated.",
          "transfer_already_compensated",
          409,
        );

      await this.debt.requireNoOutstanding(observed.accountId, "transfer");
      const destinationAvailable =
        observed.toWallet === "funding"
          ? (await this.wallet.summary(observed.accountId)).available.minorAmount
          : await this.earnings.available(observed.accountId, "USD");
      if (destinationAvailable < observed.netMinor)
        throw new PublicApplicationError(
          "The full destination amount is no longer available; the transfer cannot be safely compensated.",
          "transfer_compensation_insufficient_destination",
          409,
        );

      if (observed.feeMinor > 0n) {
        await this.repository.lockTreasuryBalance();
        if ((await this.repository.treasuryBalance()) < observed.feeMinor)
          throw new PublicApplicationError(
            "Treasury cannot safely refund the original transfer fee.",
            "transfer_compensation_treasury_shortfall",
            409,
          );
      }

      const id = newId();
      const correlationId = newId();
      const compensation = await this.repository.create({
        id,
        transferId: observed.id,
        accountId: observed.accountId,
        fromWallet: observed.fromWallet,
        toWallet: observed.toWallet,
        grossMinor: observed.grossMinor,
        feeMinor: observed.feeMinor,
        netMinor: observed.netMinor,
        reason,
        recovery: {
          destinationWalletMinor: observed.netMinor,
          sourceWalletMinor: observed.grossMinor,
          feeRefundedMinor: observed.feeMinor,
          debtMinor: 0n,
        },
        createdBy: input.actorId,
        correlationId,
        idempotencyKey: key,
        createdAt: new Date(),
      });
      await this.audit.record({
        actorId: input.actorId,
        correlationId,
        action: "wallet.transfer.compensated",
        subjectType: "wallet_transfer_compensation",
        subjectId: compensation.id,
        previousState: { transferId: observed.id },
        newState: {
          ...compensation,
          grossMinor: compensation.grossMinor.toString(),
          feeMinor: compensation.feeMinor.toString(),
          netMinor: compensation.netMinor.toString(),
          recovery: {
            destinationWalletMinor: compensation.recovery.destinationWalletMinor.toString(),
            sourceWalletMinor: compensation.recovery.sourceWalletMinor.toString(),
            feeRefundedMinor: compensation.recovery.feeRefundedMinor.toString(),
            debtMinor: compensation.recovery.debtMinor.toString(),
          },
          createdAt: compensation.createdAt.toISOString(),
        },
      });
      return compensation;
    });
  }

  get(id: string) {
    return this.repository.findById(id);
  }

  list(input: Parameters<WalletTransferCompensationRepository["list"]>[0]) {
    return this.repository.list(input);
  }
}
