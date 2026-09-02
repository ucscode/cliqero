import { newId } from "@/kernel/ids";
import type { EventOutbox } from "@/kernel/events";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { SqlExecutor } from "@/infrastructure/postgres/database";
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
    private readonly sql: SqlExecutor,
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
    if (existing) return this.resolveIdempotent(existing, input);
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
      await this.sql.query(`select pg_advisory_xact_lock(hashtextextended($1,0))`, [
        `withdrawal:idempotency:${input.idempotencyKey}`,
      ]);
      const prior = await this.withdrawals.findByIdempotencyKey(input.idempotencyKey);
      if (prior) return this.resolveIdempotent(prior, input);
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
  private resolveIdempotent(
    existing: Withdrawal,
    input: {
      accountId: string;
      amountMinor: bigint;
      currency: string;
      destinationType: "bank" | "manual";
      destinationReference: string;
    },
  ) {
    const same =
      existing.accountId === input.accountId &&
      existing.amount.minorAmount === input.amountMinor &&
      existing.amount.currency === input.currency &&
      existing.destinationType === input.destinationType &&
      existing.destinationReference === input.destinationReference.trim();
    if (!same) throw new Error("Withdrawal idempotency key is already used for another request");
    return existing;
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
    if (!reason.trim()) throw new Error("Withdrawal rejection reason is required");
    return this.uow.transaction(async () => {
      const withdrawal = await this.withdrawals.findByIdForUpdate(id);
      if (!withdrawal) throw new Error("Withdrawal not found");
      if (withdrawal.state !== "requested" && withdrawal.state !== "approved")
        throw new Error(`Invalid withdrawal transition from ${withdrawal.state}`);
      const payout = (
        await this.sql.query<{ state: string; attempt_state: string | null }>(
          `select e.state, a.state attempt_state
             from payout_capability.executions e
             left join lateral (
               select state from payout_capability.attempts
                where execution_id=e.id order by attempt_number desc limit 1
             ) a on true
            where e.withdrawal_id=$1
            for update of e`,
          [id],
        )
      ).rows[0];
      if (
        payout &&
        (["submitted", "unknown", "succeeded"].includes(payout.state) ||
          (payout.attempt_state &&
            ["submitted", "pending", "unknown", "succeeded"].includes(payout.attempt_state)))
      )
        throw new Error("Withdrawal cannot be rejected after payout execution started");
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
