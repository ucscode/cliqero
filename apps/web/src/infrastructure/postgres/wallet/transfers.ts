import { newId } from "@/kernel/ids";
import { PublicApplicationError } from "@/kernel/errors";
import { calculateFee, type FeeOperation, type FeePolicy } from "@/modules/fee/policy";
import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { WalletService } from "@/application/wallet/service";
import type { LedgerFundsReservationService } from "@/modules/ledger/reservations";
import type { AccountDebtService } from "@/application/finance/account-debt";
import type { WalletName } from "@/modules/wallet/wallet";
import type { AuditRecorder } from "@/application/shared/audit";

export class PostgresWalletTransferService {
  constructor(
    private readonly sql: QueryExecutor,
    private readonly uow: UnitOfWork,
    private readonly loadFees: () => FeePolicy,
    private readonly wallet: Pick<WalletService, "summary">,
    private readonly earnings: Pick<LedgerFundsReservationService, "available">,
    private readonly debt?: AccountDebtService,
    private readonly audit?: AuditRecorder,
  ) {}

  quote(from: WalletName, grossMinor: bigint) {
    const operation: FeeOperation =
      from === "funding" ? "funding_to_earning" : "earning_to_funding";
    return calculateFee(grossMinor, this.loadFees(), operation);
  }

  async transfer(input: {
    accountId: string;
    from: WalletName;
    to: WalletName;
    grossMinor: bigint;
    idempotencyKey: string;
  }) {
    if (
      input.from === input.to ||
      !["funding", "earnings"].includes(input.from) ||
      !["funding", "earnings"].includes(input.to)
    )
      throw new PublicApplicationError(
        "Choose two different wallet balances.",
        "invalid_transfer",
        400,
      );
    if (input.grossMinor <= 0n)
      throw new PublicApplicationError(
        "Transfer amount must be positive.",
        "invalid_transfer",
        400,
      );
    if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200)
      throw new PublicApplicationError(
        "A valid idempotency key is required.",
        "invalid_idempotency_key",
        400,
      );

    return this.uow.transaction(async () => {
      await this.sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `wallet-transfer:${input.accountId}`,
      ]);
      const prior = (
        await this.sql.query<{
          id: string;
          gross_minor: string;
          from_wallet: WalletName;
          to_wallet: WalletName;
          fee_minor: string;
          net_minor: string;
        }>(
          `select uuid id,gross_minor,from_wallet,to_wallet,fee_minor,net_minor from wallet_capability.transfers where account_id=(select id from identity_capability.accounts where uuid=$1) and idempotency_key=$2`,
          [input.accountId, input.idempotencyKey],
        )
      ).rows[0];
      if (prior) {
        if (
          BigInt(prior.gross_minor) !== input.grossMinor ||
          prior.from_wallet !== input.from ||
          prior.to_wallet !== input.to
        )
          throw new PublicApplicationError(
            "Idempotency key was already used for another transfer.",
            "idempotency_conflict",
            409,
          );
        return {
          id: prior.id,
          from: prior.from_wallet,
          to: prior.to_wallet,
          grossMinor: prior.gross_minor,
          feeMinor: prior.fee_minor,
          netMinor: prior.net_minor,
        };
      }

      await this.debt?.requireNoOutstanding(input.accountId, "transfer");

      const feeOperation: FeeOperation =
        input.from === "funding" ? "funding_to_earning" : "earning_to_funding";
      const amounts = calculateFee(input.grossMinor, this.loadFees(), feeOperation);
      const available = await this.available(input.accountId, input.from);
      if (available < amounts.grossMinor)
        throw new PublicApplicationError(
          "There is not enough available balance for this transfer.",
          "insufficient_funds",
          409,
        );

      const id = newId();
      const correlation = id;
      await this.sql.query(
        `insert into wallet_capability.transfers(uuid,account_id,from_wallet,to_wallet,gross_minor,fee_minor,net_minor,idempotency_key,correlation_id)
         values($1,(select id from identity_capability.accounts where uuid=$2),$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          input.accountId,
          input.from,
          input.to,
          amounts.grossMinor.toString(),
          amounts.feeMinor.toString(),
          amounts.netMinor.toString(),
          input.idempotencyKey,
          correlation,
        ],
      );

      if (input.from === "funding") {
        await this.fundingLeg(id, correlation, input.idempotencyKey, "debit", amounts.grossMinor);
        await this.adjustment(
          input.accountId,
          amounts.netMinor,
          "Transfer from funding to earnings",
          id,
          input.accountId,
        );
      } else {
        await this.adjustment(
          input.accountId,
          -amounts.grossMinor,
          "Transfer from earnings to funding",
          id,
          input.accountId,
        );
        await this.fundingLeg(id, correlation, input.idempotencyKey, "credit", amounts.netMinor);
      }
      if (amounts.feeMinor > 0n) {
        await this.sql.query(
          `insert into treasury_capability.entries(uuid,direction,amount_minor,title,note,source_kind,source_id,idempotency_key,actor_id,actor_kind,correlation_id)
           values($1,'credit',$2,$3,$4,'wallet_transfer',$5,$6,(select id from identity_capability.accounts where uuid=$7),'customer',$8)`,
          [
            newId(),
            amounts.feeMinor.toString(),
            input.from === "funding"
              ? "Funding to earnings transfer fee"
              : "Earnings to funding transfer fee",
            `Transfer ${id}`,
            id,
            `wallet-transfer:${input.idempotencyKey}:fee`,
            input.accountId,
            correlation,
          ],
        );
      }
      await this.audit?.record({
        actorId: input.accountId,
        correlationId: correlation,
        action: "wallet.transfer.created",
        subjectType: "wallet_transfer",
        subjectId: id,
        previousState: null,
        newState: {
          from: input.from,
          to: input.to,
          grossMinor: amounts.grossMinor.toString(),
          feeMinor: amounts.feeMinor.toString(),
          netMinor: amounts.netMinor.toString(),
          idempotencyKey: input.idempotencyKey,
        },
      });
      return {
        id,
        from: input.from,
        to: input.to,
        grossMinor: amounts.grossMinor.toString(),
        feeMinor: amounts.feeMinor.toString(),
        netMinor: amounts.netMinor.toString(),
      };
    });
  }

  private async fundingLeg(
    transferId: string,
    correlation: string,
    key: string,
    direction: "credit" | "debit",
    amount: bigint,
  ) {
    if (amount === 0n) return;
    await this.sql.query(
      `insert into wallet_capability.transfer_entries(uuid,transfer_id,wallet,direction,amount_minor,idempotency_key,correlation_id)
       values($1,(select id from wallet_capability.transfers where uuid=$2),'funding',$3,$4,$5,$6)`,
      [
        newId(),
        transferId,
        direction,
        amount.toString(),
        `wallet-transfer:${key}:funding`,
        correlation,
      ],
    );
  }

  private async adjustment(
    accountId: string,
    amount: bigint,
    reason: string,
    transferId: string,
    actorId: string,
  ) {
    if (amount === 0n) return;
    await this.sql.query(
      `insert into ledger_capability.earnings_adjustments(uuid,account_id,amount_minor,reason,reference,created_by,correlation_id)
       values($1,(select id from identity_capability.accounts where uuid=$2),$3,$4,$5,(select id from identity_capability.accounts where uuid=$6),$7)`,
      [newId(), accountId, amount.toString(), reason, transferId, actorId, transferId],
    );
  }

  private async available(accountId: string, wallet: WalletName): Promise<bigint> {
    if (wallet === "funding") return (await this.wallet.summary(accountId)).available.minorAmount;
    return this.earnings.available(accountId, "USD");
  }
}
