import { newId } from "@/kernel/ids";
import type { EventOutbox } from "@/kernel/events";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { LedgerFundsReservationService } from "@/modules/ledger/reservations";
import type {
  Withdrawal,
  WithdrawalPolicyRepository,
  WithdrawalRepository,
} from "@/modules/withdrawal/withdrawal";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import { Money } from "@/modules/money/money";
export class WithdrawalService {
  constructor(
    private readonly withdrawals: WithdrawalRepository,
    private readonly policy: WithdrawalPolicyRepository,
    private readonly funds: LedgerFundsReservationService,
    private readonly outbox: EventOutbox,
    private readonly uow: UnitOfWork,
    private readonly operators: OperatorAuthorizationService,
  ) {}
  async request(input: {
    accountId: string;
    amountMinor: bigint;
    currency: string;
    destinationType: "bank" | "manual";
    destinationReference: string;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<Withdrawal> {
    const existing = await this.withdrawals.findByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;
    const policy = await this.policy.getActive();
    if (!policy.enabled) throw new Error("Withdrawals are disabled");
    if (input.currency !== policy.minimumAmount.currency)
      throw new Error("Withdrawal currency is not supported");
    if (input.amountMinor < policy.minimumAmount.minorAmount)
      throw new Error("Withdrawal amount is below the minimum");
    if (policy.maximumAmount && input.amountMinor > policy.maximumAmount.minorAmount)
      throw new Error("Withdrawal amount exceeds the maximum");
    if (!input.destinationReference.trim()) throw new Error("Withdrawal destination is required");
    return this.uow.transaction(async () => {
      const prior = await this.withdrawals.findByIdempotencyKey(input.idempotencyKey);
      if (prior) return prior;
      const id = newId();
      const amount = Money.of(input.amountMinor, input.currency);
      const withdrawal: Withdrawal = {
        id,
        accountId: input.accountId,
        amount,
        destinationType: input.destinationType,
        destinationReference: input.destinationReference.trim(),
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
  async list(accountId: string) {
    return this.withdrawals.listForAccount(accountId);
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
    await this.operators.requireOperator(actorId);
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
  async complete(actorId: string, id: string) {
    return this.operatorTransition(
      actorId,
      id,
      "approved",
      "completed",
      "withdrawal.completed",
      undefined,
      false,
      "completed",
    );
  }
  private async operatorTransition(
    actorId: string,
    id: string,
    from: "requested" | "approved",
    to: "approved" | "rejected" | "completed",
    event: string,
    reason?: string,
    release = false,
    completion?: "completed",
  ) {
    await this.operators.requireOperator(actorId);
    return this.uow.transaction(async () => {
      const withdrawal = await this.withdrawals.findByIdForUpdate(id);
      if (!withdrawal) throw new Error("Withdrawal not found");
      if (withdrawal.state !== from)
        throw new Error(`Invalid withdrawal transition from ${withdrawal.state}`);
      await this.withdrawals.transition(id, from, to, reason);
      if (release || completion)
        await this.funds.releaseOrComplete({
          withdrawalId: id,
          accountId: withdrawal.accountId,
          kind: release ? "released" : "completed",
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
