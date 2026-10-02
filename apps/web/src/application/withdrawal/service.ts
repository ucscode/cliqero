import { newId } from "@/kernel/ids";
import type { EventOutbox } from "@/kernel/events";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { LedgerFundsReservationService } from "@/modules/ledger/reservations";
import type {
  Withdrawal,
  WithdrawalPolicySource,
  WithdrawalRepository,
} from "@/modules/withdrawal/withdrawal";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import { Money } from "@/modules/money/money";
import type { WithdrawalPersistence } from "@/application/withdrawal/contracts";
import type { WithdrawalDestinationService } from "@/application/withdrawal/destinations";
import { calculateFee, type FeePolicySource } from "@/modules/fee/policy";
import type { TreasuryRepository } from "@/modules/treasury/treasury";
import { PublicApplicationError } from "@/kernel/errors";
export class WithdrawalService {
  constructor(
    private readonly withdrawals: WithdrawalRepository,
    private readonly policy: WithdrawalPolicySource,
    private readonly funds: LedgerFundsReservationService,
    private readonly outbox: EventOutbox,
    private readonly uow: UnitOfWork,
    private readonly operators: OperatorAuthorizationService,
    private readonly persistence: WithdrawalPersistence,
    private readonly destinations: WithdrawalDestinationService,
    private readonly feePolicy: FeePolicySource,
    private readonly treasury: TreasuryRepository,
  ) {}
  async requestByOperator(
    actorId: string,
    input: {
      accountId: string;
      amountMinor: string;
      destinationId: string;
      idempotencyKey: string;
    },
  ) {
    await this.operators.requireCapability(actorId, "withdrawals.manage");
    if (!/^\d+$/.test(input.amountMinor) || BigInt(input.amountMinor) <= 0n)
      throw new PublicApplicationError(
        "Withdrawal amount must be positive.",
        "invalid_amount",
        400,
      );
    const policy = await this.policy.getActive();
    return this.request({
      accountId: input.accountId,
      amountMinor: BigInt(input.amountMinor),
      currency: policy.minimumAmount.currency,
      destinationId: input.destinationId,
      idempotencyKey: input.idempotencyKey,
      correlationId: newId(),
    });
  }
  async request(input: {
    accountId: string;
    amountMinor: bigint;
    currency: string;
    destinationId: string;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<Withdrawal> {
    const existing = await this.withdrawals.findByIdempotencyKey(
      input.accountId,
      input.idempotencyKey,
    );
    if (existing) return this.resolveIdempotent(existing, input);
    const policy = await this.policy.getActive();
    if (!policy.enabled) throw new Error("Withdrawals are disabled");
    if (input.currency !== policy.minimumAmount.currency)
      throw new Error("Withdrawal currency is not supported");
    if (input.amountMinor < policy.minimumAmount.minorAmount)
      throw new Error("Withdrawal amount is below the minimum");
    if (policy.maximumAmount && input.amountMinor > policy.maximumAmount.minorAmount)
      throw new Error("Withdrawal amount exceeds the maximum");
    return this.persistence.withIdempotencyLock(input.accountId, input.idempotencyKey, async () => {
      const prior = await this.withdrawals.findByIdempotencyKey(
        input.accountId,
        input.idempotencyKey,
      );
      if (prior) return this.resolveIdempotent(prior, input);
      const destination = await this.destinations.resolveForWithdrawal(
        input.accountId,
        input.destinationId,
      );
      const id = newId();
      const amount = Money.of(input.amountMinor, input.currency);
      const withdrawal: Withdrawal = {
        id,
        accountId: input.accountId,
        amount,
        fee: Money.of(0n, "USD"),
        netAmount: amount,
        destination,
        state: "requested",
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        reason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const feePolicy = await this.feePolicy.getActive();
      const { feeMinor, netMinor } = calculateFee(amount.minorAmount, feePolicy, "withdrawal");
      withdrawal.fee = Money.of(feeMinor, "USD");
      withdrawal.netAmount = Money.of(netMinor, "USD");
      await this.withdrawals.create(withdrawal);
      await this.funds.reserve({
        withdrawalId: id,
        accountId: input.accountId,
        amount,
        correlationId: input.correlationId,
      });
      await this.outbox.append([
        {
          id: newId(),
          name: "withdrawal.requested",
          aggregateId: id,
          correlationId: input.correlationId,
          occurredAt: new Date(),
          payload: { withdrawalId: id, accountId: input.accountId },
        },
      ]);
      return withdrawal;
    });
  }
  private resolveIdempotent(
    existing: Withdrawal,
    input: {
      accountId: string;
      amountMinor: bigint;
      currency: string;
      destinationId: string;
    },
  ) {
    const same =
      existing.accountId === input.accountId &&
      existing.amount.minorAmount === input.amountMinor &&
      existing.amount.currency === input.currency &&
      existing.destination.savedDestinationId === input.destinationId;
    if (!same) throw new Error("Withdrawal idempotency key is already used for another request");
    return existing;
  }
  async list(accountId: string, page: { cursor?: string; limit: number }) {
    return this.withdrawals.listForAccount(accountId, page);
  }
  async get(accountId: string, id: string) {
    const withdrawal = await this.withdrawals.findById(id);
    if (!withdrawal || withdrawal.accountId !== accountId) throw new Error("Withdrawal not found");
    return withdrawal;
  }
  async approve(actorId: string, id: string) {
    return this.operatorTransition(actorId, id, "requested", "approved", "withdrawal.approved");
  }
  async reject(actorId: string, id: string, reason: string) {
    await this.operators.requireCapability(actorId, "withdrawals.manage");
    if (!reason.trim()) throw new Error("Withdrawal rejection reason is required");
    return this.uow.transaction(async () => {
      const withdrawal = await this.withdrawals.findByIdForUpdate(id);
      if (!withdrawal) throw new Error("Withdrawal not found");
      if (withdrawal.state !== "requested" && withdrawal.state !== "approved")
        throw new Error(`Invalid withdrawal transition from ${withdrawal.state}`);
      await this.withdrawals.transition(id, withdrawal.state, "rejected", reason);
      await this.funds.releaseOrComplete({
        withdrawalId: id,
        accountId: withdrawal.accountId,
        kind: "released",
        correlationId: withdrawal.correlationId,
      });
      await this.outbox.append([
        {
          id: newId(),
          name: "withdrawal.rejected",
          aggregateId: id,
          correlationId: withdrawal.correlationId,
          occurredAt: new Date(),
          payload: { withdrawalId: id },
        },
      ]);
      return { ...withdrawal, state: "rejected" as const };
    });
  }
  async cancel(accountId: string, id: string) {
    return this.uow.transaction(async () => {
      const withdrawal = await this.withdrawals.findByIdForUpdate(id);
      if (!withdrawal || withdrawal.accountId !== accountId)
        throw new Error("Withdrawal not found");
      if (withdrawal.state !== "requested")
        throw new Error("Withdrawal cannot be cancelled in its current state");
      await this.withdrawals.transition(id, "requested", "cancelled", "Cancelled by account");
      await this.funds.releaseOrComplete({
        withdrawalId: id,
        accountId,
        kind: "released",
        correlationId: withdrawal.correlationId,
      });
      await this.outbox.append([
        {
          id: newId(),
          name: "withdrawal.cancelled",
          aggregateId: id,
          correlationId: withdrawal.correlationId,
          occurredAt: new Date(),
          payload: { withdrawalId: id },
        },
      ]);
      return { ...withdrawal, state: "cancelled" as const };
    });
  }
  async complete(
    actorId: string,
    id: string,
    input: { externalReference?: string; note?: string } = {},
  ) {
    await this.operators.requireCapability(actorId, "withdrawals.manage");
    const externalReference = input.externalReference?.trim() || null;
    const note = input.note?.trim() || null;
    if (externalReference && externalReference.length > 200)
      throw new Error("External reference must be 200 characters or fewer");
    if (note && note.length > 500)
      throw new Error("Completion note must be 500 characters or fewer");
    return this.uow.transaction(async () => {
      const withdrawal = await this.withdrawals.findByIdForUpdate(id);
      if (!withdrawal) throw new Error("Withdrawal not found");
      if (withdrawal.state !== "approved")
        throw new Error(`Invalid withdrawal transition from ${withdrawal.state}`);
      const completedAt = await this.withdrawals.complete(id, actorId, externalReference, note);
      await this.funds.releaseOrComplete({
        withdrawalId: id,
        accountId: withdrawal.accountId,
        kind: "completed",
        correlationId: withdrawal.correlationId,
      });
      const feeMinor = withdrawal.fee?.minorAmount ?? 0n;
      if (feeMinor > 0n)
        await this.treasury.create({
          id: newId(),
          direction: "credit",
          amountMinor: feeMinor,
          title: "Withdrawal fee",
          note: `Withdrawal ${id}; gross ${withdrawal.amount.minorAmount}; net ${withdrawal.netAmount?.minorAmount ?? withdrawal.amount.minorAmount}`,
          sourceKind: "withdrawal_fee",
          sourceId: id,
          idempotencyKey: `withdrawal:${id}:fee`,
          actorId,
          createdAt: completedAt,
        });
      await this.outbox.append([
        {
          id: newId(),
          name: "withdrawal.completed",
          aggregateId: id,
          correlationId: withdrawal.correlationId,
          occurredAt: completedAt,
          payload: {
            withdrawalId: id,
            completedBy: actorId,
            externalReference,
          },
        },
      ]);
      return {
        ...withdrawal,
        state: "completed" as const,
        externalReference,
        completionNote: note,
        completedBy: actorId,
        completedAt,
        updatedAt: completedAt,
      };
    });
  }
  async updateByOperator(
    actorId: string,
    id: string,
    input: {
      amountMinor: string;
      destinationId: string;
      state: "requested" | "approved" | "rejected";
      reason: string;
    },
  ) {
    await this.operators.requireCapability(actorId, "withdrawals.manage");
    if (!/^\d+$/.test(input.amountMinor) || BigInt(input.amountMinor) <= 0n)
      throw new PublicApplicationError(
        "Withdrawal amount must be positive.",
        "invalid_amount",
        400,
      );
    const reason = input.reason.trim();
    return this.uow.transaction(async () => {
      const current = await this.withdrawals.findByIdForUpdate(id);
      if (!current) throw new PublicApplicationError("Withdrawal not found.", "not_found", 404);
      if (current.state !== "requested" && current.state !== "approved")
        throw new PublicApplicationError(
          "This withdrawal can no longer be edited.",
          "withdrawal_immutable",
          409,
        );
      const policy = await this.policy.getActive();
      const amountMinor = BigInt(input.amountMinor);
      if (
        current.state === "approved" &&
        (amountMinor !== current.amount.minorAmount ||
          input.destinationId !== current.destination.savedDestinationId)
      )
        throw new PublicApplicationError(
          "Amount and destination are locked after approval.",
          "withdrawal_immutable",
          409,
        );
      if (current.state === "approved" && input.state === "requested")
        throw new PublicApplicationError(
          "Approved withdrawals cannot return to requested.",
          "invalid_transition",
          409,
        );
      if (current.state === "requested" && !policy.enabled)
        throw new PublicApplicationError("Withdrawals are disabled.", "withdrawals_disabled", 409);
      if (current.state === "requested" && amountMinor < policy.minimumAmount.minorAmount)
        throw new PublicApplicationError(
          "Withdrawal amount is below the minimum.",
          "invalid_amount",
          400,
        );
      if (
        current.state === "requested" &&
        policy.maximumAmount &&
        amountMinor > policy.maximumAmount.minorAmount
      )
        throw new PublicApplicationError(
          "Withdrawal amount exceeds the maximum.",
          "invalid_amount",
          400,
        );
      if (input.state === "rejected" && !reason)
        throw new PublicApplicationError("A rejection reason is required.", "reason_required", 400);

      const destination =
        current.state === "approved"
          ? current.destination
          : await this.destinations.resolveForWithdrawal(current.accountId, input.destinationId);
      const amount = Money.of(amountMinor, current.amount.currency);
      const { feeMinor, netMinor } =
        current.state === "approved"
          ? {
              feeMinor: current.fee?.minorAmount ?? 0n,
              netMinor: current.netAmount?.minorAmount ?? current.amount.minorAmount,
            }
          : calculateFee(amountMinor, await this.feePolicy.getActive(), "withdrawal");
      const updated: Withdrawal = {
        ...current,
        amount,
        fee: Money.of(feeMinor, "USD"),
        netAmount: Money.of(netMinor, "USD"),
        destination,
        reason: reason || null,
        updatedAt: new Date(),
      };
      if (current.state === "requested" && amountMinor !== current.amount.minorAmount)
        await this.funds.resize({
          withdrawalId: id,
          accountId: current.accountId,
          amount,
          correlationId: current.correlationId,
        });
      if (current.state === "requested") await this.withdrawals.updateMutable(updated);

      if (current.state === "requested" && input.state !== "requested") {
        const target = input.state;
        await this.withdrawals.transition(
          id,
          "requested",
          target,
          target === "rejected" ? reason : undefined,
        );
        if (target === "rejected")
          await this.funds.releaseOrComplete({
            withdrawalId: id,
            accountId: current.accountId,
            kind: "released",
            correlationId: current.correlationId,
          });
        await this.outbox.append([
          {
            id: newId(),
            name: target === "approved" ? "withdrawal.approved" : "withdrawal.rejected",
            aggregateId: id,
            correlationId: current.correlationId,
            occurredAt: new Date(),
            payload: { withdrawalId: id, updatedBy: actorId },
          },
        ]);
        return { ...updated, state: target };
      }
      if (current.state === "approved" && input.state === "rejected") {
        await this.withdrawals.transition(id, "approved", "rejected", reason);
        await this.funds.releaseOrComplete({
          withdrawalId: id,
          accountId: current.accountId,
          kind: "released",
          correlationId: current.correlationId,
        });
        await this.outbox.append([
          {
            id: newId(),
            name: "withdrawal.rejected",
            aggregateId: id,
            correlationId: current.correlationId,
            occurredAt: new Date(),
            payload: { withdrawalId: id, updatedBy: actorId },
          },
        ]);
        return { ...updated, state: "rejected" as const };
      }
      return current.state === "approved" ? current : updated;
    });
  }

  async deleteByOperator(actorId: string, id: string) {
    await this.operators.requireCapability(actorId, "withdrawals.manage");
    return this.uow.transaction(async () => {
      const current = await this.withdrawals.findByIdForUpdate(id);
      if (!current) throw new PublicApplicationError("Withdrawal not found.", "not_found", 404);
      if (!["requested", "rejected", "cancelled", "failed"].includes(current.state))
        throw new PublicApplicationError(
          "This withdrawal contains immutable payout history and cannot be deleted.",
          "withdrawal_immutable",
          409,
        );
      await this.funds.releaseOrComplete({
        withdrawalId: id,
        accountId: current.accountId,
        kind: "released",
        correlationId: current.correlationId,
      });
      await this.funds.remove(id, current.accountId);
      await this.withdrawals.deleteMutable(id);
      return { id, deleted: true };
    });
  }
  private async operatorTransition(
    actorId: string,
    id: string,
    from: "requested" | "approved",
    to: "approved" | "rejected" | "completed",
    event: string,
    reason?: string,
    release = false,
  ) {
    await this.operators.requireCapability(actorId, "withdrawals.manage");
    return this.uow.transaction(async () => {
      const withdrawal = await this.withdrawals.findByIdForUpdate(id);
      if (!withdrawal) throw new Error("Withdrawal not found");
      if (withdrawal.state !== from)
        throw new Error(`Invalid withdrawal transition from ${withdrawal.state}`);
      await this.withdrawals.transition(id, from, to, reason);
      if (release)
        await this.funds.releaseOrComplete({
          withdrawalId: id,
          accountId: withdrawal.accountId,
          kind: "released",
          correlationId: withdrawal.correlationId,
        });
      await this.outbox.append([
        {
          id: newId(),
          name: event,
          aggregateId: id,
          correlationId: withdrawal.correlationId,
          occurredAt: new Date(),
          payload: { withdrawalId: id },
        },
      ]);
      return { ...withdrawal, state: to };
    });
  }
}
