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
  ) {}
  async request(input: {
    accountId: string;
    amountMinor: bigint;
    currency: string;
    destinationId: string;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<Withdrawal> {
    const existing = await this.withdrawals.findByIdempotencyKey(input.idempotencyKey);
    if (existing) return this.resolveIdempotent(existing, input);
    const policy = await this.policy.getActive();
    if (!policy.enabled) throw new Error("Withdrawals are disabled");
    if (input.currency !== policy.minimumAmount.currency)
      throw new Error("Withdrawal currency is not supported");
    if (input.amountMinor < policy.minimumAmount.minorAmount)
      throw new Error("Withdrawal amount is below the minimum");
    if (policy.maximumAmount && input.amountMinor > policy.maximumAmount.minorAmount)
      throw new Error("Withdrawal amount exceeds the maximum");
    return this.persistence.withIdempotencyLock(input.idempotencyKey, async () => {
      const prior = await this.withdrawals.findByIdempotencyKey(input.idempotencyKey);
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
        destination,
        state: "requested",
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        reason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
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
