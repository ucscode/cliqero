import { newId } from "@/kernel/ids";
import { Money } from "@/modules/money/money";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { EventOutbox } from "@/kernel/events";
import type { WithdrawalRepository } from "@/modules/withdrawal/withdrawal";
import type { PayoutProviderRegistry, PayoutResult } from "@/modules/withdrawal/provider";
import type { PostgresPayoutRepository, PayoutAttempt } from "@/infrastructure/postgres/payouts";
import type { LedgerFundsReservationService } from "@/modules/ledger/reservations";
export class PayoutExecutionProcessor {
  constructor(
    private readonly withdrawals: WithdrawalRepository,
    private readonly payouts: PostgresPayoutRepository,
    private readonly providers: PayoutProviderRegistry,
    private readonly funds: LedgerFundsReservationService,
    private readonly outbox: EventOutbox,
    private readonly uow: UnitOfWork,
    private readonly defaultProviderName = "development",
  ) {}
  async execute(withdrawalId: string, correlationId: string) {
    const prepared = await this.prepare(withdrawalId, correlationId);
    if (!prepared.submit) return prepared.attempt;
    const provider = this.providers.get(prepared.execution.providerName);
    let result: PayoutResult;
    try {
      result = await provider.submitPayout({
        withdrawal: prepared.withdrawal,
        idempotencyKey: prepared.execution.idempotencyKey,
      });
    } catch (error) {
      const e = error as {
        unknownOutcome?: boolean;
        failureCategory?: "retryable_technical" | "provider_rejection" | "permanent_validation";
      };
      result = e.unknownOutcome
        ? {
            kind: "unknown",
            reason: error instanceof Error ? error.message : "Provider response was indeterminate",
          }
        : {
            kind: "failed",
            category: e.failureCategory ?? "retryable_technical",
            reason: error instanceof Error ? error.message : "Provider request failed",
          };
    }
    return this.finish(prepared, result, correlationId);
  }
  async reconcile(withdrawalId: string, correlationId: string) {
    const execution = await this.payouts.getExecutionForUpdate(withdrawalId);
    if (!execution) throw new Error("Payout execution not found");
    const withdrawal = await this.withdrawals.findById(withdrawalId);
    if (!withdrawal) throw new Error("Withdrawal not found");
    const attempt = await this.payouts.latestAttempt(execution.id);
    if (!attempt?.providerReference)
      throw new Error("Payout reference is unavailable for reconciliation");
    const provider = this.providers.get(execution.providerName);
    const result = await provider.verifyPayout({
      providerReference: attempt.providerReference,
      withdrawal,
    });
    return this.finish({ withdrawal, execution, attempt, submit: false }, result, correlationId);
  }
  async attempts(withdrawalId: string) {
    return this.payouts.listAttempts(withdrawalId);
  }
  async applyProviderResult(withdrawalId: string, result: PayoutResult, correlationId: string) {
    const execution = await this.payouts.getExecutionForUpdate(withdrawalId);
    if (!execution) throw new Error("Payout execution not found");
    const withdrawal = await this.withdrawals.findById(withdrawalId);
    if (!withdrawal) throw new Error("Withdrawal not found");
    const attempt = await this.payouts.latestAttempt(execution.id);
    if (!attempt) throw new Error("Payout attempt not found");
    return this.finish({ withdrawal, execution, attempt, submit: false }, result, correlationId);
  }
  async manualComplete(withdrawalId: string, actorId: string, correlationId: string) {
    return this.uow.transaction(async () => {
      const withdrawal = await this.withdrawals.findByIdForUpdate(withdrawalId);
      if (!withdrawal || withdrawal.state !== "approved")
        throw new Error("Withdrawal is not approved");
      const execution =
        (await this.payouts.getExecutionForUpdate(withdrawalId)) ??
        (await this.payouts.createExecution({
          id: newId(),
          withdrawalId,
          providerName: "manual",
          idempotencyKey: `manual:${withdrawalId}`,
        }));
      const attempt = await this.payouts.latestAttempt(execution.id);
      if (!attempt) {
        await this.payouts.createAttempt({
          id: newId(),
          executionId: execution.id,
          withdrawalId,
          providerName: "manual",
          providerRequestKey: execution.idempotencyKey,
          amountMinor: withdrawal.amount.minorAmount.toString(),
          currency: withdrawal.amount.currency,
          correlationId,
          attemptNumber: 1,
        });
      }
      await this.payouts.finishAttempt(
        (await this.payouts.latestAttempt(execution.id))!.id,
        execution.id,
        {
          kind: "succeeded",
          providerReference: `manual-${withdrawalId}`,
          amount: withdrawal.amount,
          currency: withdrawal.amount.currency,
          metadata: { actorId },
        },
      );
      await this.funds.releaseOrComplete({
        withdrawalId,
        accountId: withdrawal.accountId,
        kind: "completed",
        correlationId,
      });
      await this.withdrawals.transition(
        withdrawalId,
        "approved",
        "completed",
        "Manual payout completion",
      );
      await this.outbox.append([
        {
          id: newId(),
          name: "payout.succeeded",
          aggregateId: withdrawalId,
          correlationId,
          occurredAt: new Date(),
          payload: { withdrawalId, provider: "manual" },
        },
        {
          id: newId(),
          name: "withdrawal.completed",
          aggregateId: withdrawalId,
          correlationId,
          occurredAt: new Date(),
          payload: { withdrawalId },
        },
      ]);
      return { ...withdrawal, state: "completed" as const };
    });
  }
  private async prepare(withdrawalId: string, correlationId: string) {
    return this.uow.transaction(async () => {
      const withdrawal = await this.withdrawals.findByIdForUpdate(withdrawalId);
      if (!withdrawal) throw new Error("Withdrawal not found");
      let execution = await this.payouts.getExecutionForUpdate(withdrawalId);
      if (
        execution &&
        (execution.state === "succeeded" ||
          execution.state === "submitted" ||
          execution.state === "unknown")
      )
        return {
          withdrawal,
          execution,
          attempt: await this.payouts.latestAttempt(execution.id),
          submit: false,
        };
      if (withdrawal.state !== "approved") throw new Error("Only approved withdrawals can execute");
      if (!execution)
        execution = await this.payouts.createExecution({
          id: newId(),
          withdrawalId,
          providerName: this.defaultProviderName,
          idempotencyKey: `payout:${withdrawalId}`,
        });
      const provider = this.providers.get(execution.providerName);
      if (
        !provider.capabilities.currencies.includes(withdrawal.amount.currency) ||
        !provider.capabilities.destinationTypes.includes(withdrawal.destinationType)
      )
        throw new Error("Payout provider does not support this withdrawal");
      if (
        execution.state === "failed" &&
        execution.lastError &&
        execution.nextAttemptAt &&
        execution.nextAttemptAt > new Date()
      )
        throw new Error("Payout retry is not yet eligible");
      const attemptNumber = execution.attemptCount + 1;
      await this.payouts.createAttempt({
        id: newId(),
        executionId: execution.id,
        withdrawalId,
        providerName: execution.providerName,
        providerRequestKey: execution.idempotencyKey,
        amountMinor: withdrawal.amount.minorAmount.toString(),
        currency: withdrawal.amount.currency,
        correlationId,
        attemptNumber,
      });
      await this.outbox.append([
        {
          id: newId(),
          name: "payout.attempt.created",
          aggregateId: withdrawalId,
          correlationId,
          occurredAt: new Date(),
          payload: { withdrawalId, attemptNumber },
        },
      ]);
      return {
        withdrawal,
        execution: { ...execution, state: "submitted" as const, attemptCount: attemptNumber },
        attempt: await this.payouts.latestAttempt(execution.id),
        submit: true,
      };
    });
  }
  private async finish(
    prepared: { withdrawal: any; execution: any; attempt: PayoutAttempt | null; submit: boolean },
    result: PayoutResult,
    correlationId: string,
  ) {
    if (!prepared.attempt) throw new Error("Payout attempt not found");
    await this.uow.transaction(async () => {
      await this.payouts.finishAttempt(prepared.attempt!.id, prepared.execution.id, result);
      if (result.kind === "succeeded") {
        if (
          !Money.of(BigInt(result.amount.minorAmount), result.currency).equals(
            prepared.withdrawal.amount,
          )
        )
          throw new Error("Payout amount or currency mismatch");
        const withdrawal = await this.withdrawals.findByIdForUpdate(prepared.withdrawal.id);
        if (!withdrawal || withdrawal.state !== "approved")
          throw new Error("Withdrawal is no longer approved");
        await this.funds.releaseOrComplete({
          withdrawalId: withdrawal.id,
          accountId: withdrawal.accountId,
          kind: "completed",
          correlationId,
        });
        await this.withdrawals.transition(
          withdrawal.id,
          "approved",
          "completed",
          "Payout verified",
        );
        await this.outbox.append([
          {
            id: newId(),
            name: "payout.succeeded",
            aggregateId: withdrawal.id,
            correlationId,
            occurredAt: new Date(),
            payload: { withdrawalId: withdrawal.id, providerReference: result.providerReference },
          },
        ]);
      } else if (result.kind === "unknown" || result.kind === "pending") {
        await this.outbox.append([
          {
            id: newId(),
            name: "payout.reconciliation.required",
            aggregateId: prepared.withdrawal.id,
            correlationId,
            occurredAt: new Date(),
            payload: { withdrawalId: prepared.withdrawal.id },
          },
        ]);
      } else
        await this.outbox.append([
          {
            id: newId(),
            name: "payout.failed",
            aggregateId: prepared.withdrawal.id,
            correlationId,
            occurredAt: new Date(),
            payload: {
              withdrawalId: prepared.withdrawal.id,
              category: result.kind === "failed" ? result.category : "unknown",
            },
          },
        ]);
    });
    return result;
  }
}
