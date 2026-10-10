import { newId } from "@/kernel/ids";
import type { EventOutbox } from "@/kernel/events";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { LedgerFundsReservationService } from "@/modules/ledger/reservations";
import type {
  Withdrawal,
  WithdrawalPolicySource,
  WithdrawalRepository,
  WithdrawalIdempotencyMatch,
} from "@/modules/withdrawal/withdrawal";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import { Money } from "@/modules/money/money";
import type { WithdrawalPersistence } from "@/application/withdrawal/contracts";
import type { WithdrawalDestinationService } from "@/application/withdrawal/destinations";
import type { AuditRecorder } from "@/application/shared/audit";
import { calculateFee, type FeePolicySource } from "@/modules/fee/policy";
import type { TreasuryRepository } from "@/modules/treasury/treasury";
import { PublicApplicationError } from "@/kernel/errors";
import { CrudService } from "@/kernel/crud";
import type { AccountDebtService } from "@/application/finance/account-debt";

export type WithdrawalCreateInput = {
  accountId: string;
  actorId?: string;
  amountMinor: bigint;
  currency: string;
  destinationId: string;
  idempotencyKey: string;
  correlationId: string;
  initialState?: "requested" | "approved" | "rejected";
  initialReason?: string;
};
export type WithdrawalUpdateInput = {
  amountMinor?: string;
  destinationId?: string;
  state?: "requested" | "approved" | "rejected" | "cancelled";
  reason?: string;
};

export class WithdrawalService extends CrudService<
  [input: WithdrawalCreateInput],
  [accountId: string, id: string],
  [actorId: string, id: string, input: WithdrawalUpdateInput],
  [actorId: string, id: string],
  Promise<Withdrawal>,
  Promise<Withdrawal>,
  Promise<Withdrawal>,
  Promise<{ id: string; deleted: true }>
> {
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
    private readonly audit: AuditRecorder,
    private readonly debt?: AccountDebtService,
  ) {
    super();
  }
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
    return this.create({
      accountId: input.accountId,
      actorId,
      amountMinor: BigInt(input.amountMinor),
      currency: policy.minimumAmount.currency,
      destinationId: input.destinationId,
      idempotencyKey: input.idempotencyKey,
      correlationId: newId(),
      initialState: "requested",
    });
  }
  override async create(input: WithdrawalCreateInput): Promise<Withdrawal> {
    const initialState = input.initialState ?? "requested";
    const initialReason = input.initialReason?.trim() || null;
    if (initialState === "rejected" && !initialReason)
      throw new PublicApplicationError("A rejection reason is required.", "reason_required", 400);
    const existing = await this.withdrawals.findByIdempotencyKey(
      input.accountId,
      input.idempotencyKey,
    );
    if (existing) return this.resolveIdempotent(existing, input, initialState, initialReason);
    const policy = await this.policy.getActive();
    if (!policy.enabled && initialState !== "rejected")
      throw new PublicApplicationError("Withdrawals are disabled.", "withdrawals_disabled", 409);
    if (input.currency !== policy.minimumAmount.currency)
      throw new PublicApplicationError(
        "Withdrawal currency is not supported.",
        "invalid_currency",
        400,
      );
    if (input.amountMinor < policy.minimumAmount.minorAmount)
      throw new PublicApplicationError(
        "Withdrawal amount is below the minimum.",
        "invalid_amount",
        400,
      );
    if (policy.maximumAmount && input.amountMinor > policy.maximumAmount.minorAmount)
      throw new PublicApplicationError(
        "Withdrawal amount exceeds the maximum.",
        "invalid_amount",
        400,
      );
    return this.persistence.withIdempotencyLock(input.accountId, input.idempotencyKey, async () => {
      const prior = await this.withdrawals.findByIdempotencyKey(
        input.accountId,
        input.idempotencyKey,
      );
      if (prior) return this.resolveIdempotent(prior, input, initialState, initialReason);
      if (initialState !== "rejected")
        await this.debt?.requireNoOutstandingUnderLock(input.accountId, "withdrawal");
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
        state: initialState,
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        reason: initialReason,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const feePolicy = await this.feePolicy.getActive();
      const { feeMinor, netMinor } =
        initialState === "rejected"
          ? { feeMinor: 0n, netMinor: amount.minorAmount }
          : calculateFee(amount.minorAmount, feePolicy, "withdrawal");
      withdrawal.fee = Money.of(feeMinor, "USD");
      withdrawal.netAmount = Money.of(netMinor, "USD");
      await this.withdrawals.create(withdrawal);
      if (feeMinor > 0n)
        await this.reconcileTreasuryFee(
          withdrawal,
          0n,
          feeMinor,
          input.correlationId,
          "request",
          input.actorId ?? input.accountId,
          input.actorId ? "operator" : "customer",
        );
      if (initialState !== "rejected")
        try {
          await this.funds.reserve({
            withdrawalId: id,
            accountId: input.accountId,
            amount,
            correlationId: input.correlationId,
          });
        } catch (cause) {
          if (cause instanceof Error && cause.message.includes("Insufficient available funds"))
            throw new PublicApplicationError(
              "Insufficient available earnings.",
              "insufficient_funds",
              409,
            );
          if (cause instanceof Error && cause.message.includes("Account not found"))
            throw new PublicApplicationError("Account not found.", "not_found", 404);
          throw cause;
        }
      await this.outbox.append([
        {
          id: newId(),
          name:
            initialState === "approved"
              ? "withdrawal.approved"
              : initialState === "rejected"
                ? "withdrawal.rejected"
                : "withdrawal.requested",
          aggregateId: id,
          correlationId: input.correlationId,
          occurredAt: new Date(),
          payload: { withdrawalId: id, accountId: input.accountId },
        },
      ]);
      await this.audit.record({
        actorId: input.actorId ?? input.accountId,
        correlationId: input.correlationId,
        action:
          initialState === "approved"
            ? "withdrawal.approved"
            : initialState === "rejected"
              ? "withdrawal.rejected"
              : "withdrawal.requested",
        subjectType: "withdrawal",
        subjectId: id,
        previousState: null,
        newState: {
          accountId: input.accountId,
          amountMinor: amount.minorAmount.toString(),
          feeMinor: feeMinor.toString(),
          netMinor: netMinor.toString(),
          state: initialState,
        },
      });
      return withdrawal;
    });
  }
  private resolveIdempotent(
    existing: WithdrawalIdempotencyMatch,
    input: {
      accountId: string;
      amountMinor: bigint;
      currency: string;
      destinationId: string;
    },
    initialState: NonNullable<WithdrawalCreateInput["initialState"]>,
    initialReason: string | null,
  ) {
    const withdrawal = existing.withdrawal;
    const same =
      withdrawal.accountId === input.accountId &&
      withdrawal.amount.minorAmount === input.amountMinor &&
      withdrawal.amount.currency === input.currency &&
      withdrawal.destination.savedDestinationId === input.destinationId &&
      existing.initialState === initialState &&
      existing.initialReason === initialReason;
    if (!same)
      throw new PublicApplicationError(
        "This idempotency key is already used for a different withdrawal.",
        "idempotency_conflict",
        409,
      );
    return withdrawal;
  }
  async list(accountId: string, page: { cursor?: string; limit: number }) {
    return this.withdrawals.listForAccount(accountId, page);
  }
  override async get(accountId: string, id: string) {
    const withdrawal = await this.withdrawals.findById(id);
    if (!withdrawal || withdrawal.accountId !== accountId) throw new Error("Withdrawal not found");
    return withdrawal;
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
      throw new PublicApplicationError(
        "External reference must be 200 characters or fewer.",
        "invalid_reference",
        400,
      );
    if (note && note.length > 500)
      throw new PublicApplicationError(
        "Completion note must be 500 characters or fewer.",
        "invalid_note",
        400,
      );
    return this.uow.transaction(async () => {
      const withdrawal = await this.withdrawals.findByIdForUpdate(id);
      if (!withdrawal) throw new PublicApplicationError("Withdrawal not found.", "not_found", 404);
      if (withdrawal.state !== "approved")
        throw new PublicApplicationError(
          `Only approved withdrawals can be completed; this one is ${withdrawal.state}.`,
          "invalid_transition",
          409,
        );
      const payoutInitiation = await this.withdrawals.findPayoutInitiationByWithdrawalId(id);
      if (!payoutInitiation)
        throw new PublicApplicationError(
          "Payout completion requires recorded external initiation evidence.",
          "payout_not_initiated",
          409,
        );
      const correlationId = newId();
      const completedAt = await this.withdrawals.complete(id, actorId, externalReference, note);
      await this.funds.releaseOrComplete({
        withdrawalId: id,
        accountId: withdrawal.accountId,
        kind: "completed",
        correlationId,
      });
      await this.outbox.append([
        {
          id: newId(),
          name: "withdrawal.completed",
          aggregateId: id,
          correlationId,
          occurredAt: completedAt,
          payload: {
            withdrawalId: id,
            completedBy: actorId,
            externalReference,
          },
        },
      ]);
      await this.audit.record({
        actorId,
        correlationId,
        action: "withdrawal.completed",
        subjectType: "withdrawal",
        subjectId: id,
        previousState: { state: "approved" },
        newState: { state: "completed", externalReference, note },
      });
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
  async initiatePayout(
    actorId: string,
    id: string,
    input: { idempotencyKey: string; externalReference?: string },
  ) {
    await this.operators.requireCapability(actorId, "withdrawals.manage");
    const idempotencyKey = input.idempotencyKey.trim();
    const externalReference = input.externalReference?.trim() || null;
    if (!idempotencyKey || idempotencyKey.length > 200)
      throw new PublicApplicationError(
        "A valid idempotency key is required.",
        "invalid_idempotency_key",
        400,
      );
    if (externalReference && externalReference.length > 200)
      throw new PublicApplicationError(
        "External reference must be 200 characters or fewer.",
        "invalid_reference",
        400,
      );

    return this.uow.transaction(async () => {
      await this.withdrawals.lockPayoutInitiationKey(idempotencyKey);
      const previous = await this.withdrawals.findPayoutInitiationByIdempotencyKey(idempotencyKey);
      if (previous) {
        if (
          previous.withdrawalId !== id ||
          previous.actorId !== actorId ||
          previous.externalReference !== externalReference
        )
          throw new PublicApplicationError(
            "Idempotency key was used for a different payout initiation.",
            "idempotency_conflict",
            409,
          );
        return { initiation: previous, changed: false };
      }

      const withdrawal = await this.withdrawals.findByIdForUpdate(id);
      if (!withdrawal) throw new PublicApplicationError("Withdrawal not found.", "not_found", 404);
      if (withdrawal.state !== "approved")
        throw new PublicApplicationError(
          `Only approved withdrawals can be initiated; this one is ${withdrawal.state}.`,
          "invalid_transition",
          409,
        );
      if (await this.withdrawals.findPayoutInitiationByWithdrawalId(id))
        throw new PublicApplicationError(
          "This withdrawal already has recorded payout initiation.",
          "payout_already_initiated",
          409,
        );
      if (!this.debt)
        throw new Error(
          "Payout initiation requires the account debt service for locked policy checks.",
        );
      await this.debt.requireNoOutstandingUnderLock(withdrawal.accountId, "withdrawal");

      const correlationId = newId();
      const initiationId = newId();
      await this.withdrawals.recordPayoutInitiation({
        id: initiationId,
        withdrawalId: id,
        actorId,
        correlationId,
        idempotencyKey,
        externalReference,
      });
      const initiation =
        await this.withdrawals.findPayoutInitiationByIdempotencyKey(idempotencyKey);
      if (!initiation) throw new Error("Payout initiation evidence was not persisted");
      await this.audit.record({
        actorId,
        correlationId,
        action: "withdrawal.payout_initiated",
        subjectType: "withdrawal",
        subjectId: id,
        previousState: { state: "approved", payoutInitiation: null },
        newState: {
          state: "approved",
          payoutInitiationId: initiationId,
          externalReference,
          meaning:
            "operator_attests_starting_external_payout_before_submission_not_acceptance_or_settlement",
          idempotencyKey,
        },
      });
      await this.outbox.append([
        {
          id: newId(),
          name: "withdrawal.payout-initiated",
          aggregateId: id,
          correlationId,
          occurredAt: initiation.createdAt,
          payload: {
            withdrawalId: id,
            payoutInitiationId: initiationId,
            actorId,
            externalReference,
          },
        },
      ]);
      return { initiation, changed: true };
    });
  }

  async recordPayoutFailure(
    actorId: string,
    id: string,
    input: {
      reason: string;
      externalReference: string;
      idempotencyKey: string;
    },
  ) {
    await this.operators.requireCapability(actorId, "withdrawals.manage");
    const reason = input.reason.trim();
    const externalReference = input.externalReference.trim();
    const idempotencyKey = input.idempotencyKey.trim();
    if (!reason || reason.length > 1000 || !externalReference || externalReference.length > 200)
      throw new PublicApplicationError(
        "Confirmed non-delivery reason and external reference are required.",
        "invalid_payout_failure",
        400,
      );
    if (!idempotencyKey || idempotencyKey.length > 200)
      throw new PublicApplicationError(
        "A valid idempotency key is required.",
        "invalid_idempotency_key",
        400,
      );
    return this.uow.transaction(async () => {
      await this.withdrawals.lockPayoutFailureKey(idempotencyKey);
      const previous = await this.withdrawals.findPayoutFailureByIdempotencyKey(idempotencyKey);
      if (previous) {
        if (
          previous.withdrawalId !== id ||
          previous.actorId !== actorId ||
          previous.reason !== reason ||
          previous.externalReference !== externalReference
        )
          throw new PublicApplicationError(
            "Idempotency key was used for a different payout failure.",
            "idempotency_conflict",
            409,
          );
        return { failure: previous, changed: false };
      }
      const withdrawal = await this.withdrawals.findByIdForUpdate(id);
      if (!withdrawal) throw new PublicApplicationError("Withdrawal not found.", "not_found", 404);
      if (withdrawal.state !== "approved")
        throw new PublicApplicationError(
          "Only an approved payout in progress can be reconciled as failed.",
          "invalid_transition",
          409,
        );
      if (!(await this.withdrawals.findPayoutInitiationByWithdrawalId(id)))
        throw new PublicApplicationError(
          "Payout failure requires recorded initiation and authoritative non-delivery evidence.",
          "payout_not_initiated",
          409,
        );
      if (await this.withdrawals.findPayoutFailureByWithdrawalId(id))
        throw new PublicApplicationError(
          "This payout already has a failure outcome recorded.",
          "payout_outcome_exists",
          409,
        );

      const failureId = newId();
      const correlationId = newId();
      await this.withdrawals.recordPayoutFailure({
        id: failureId,
        withdrawalId: id,
        actorId,
        correlationId,
        idempotencyKey,
        externalReference,
        reason,
      });
      await this.withdrawals.markPayoutFailed(id, reason);
      await this.funds.releaseOrComplete({
        withdrawalId: id,
        accountId: withdrawal.accountId,
        kind: "released",
        correlationId,
      });
      await this.reconcileTreasuryFee(
        withdrawal,
        withdrawal.fee?.minorAmount ?? 0n,
        0n,
        correlationId,
        "reversal",
        actorId,
        "operator",
      );
      await this.audit.record({
        actorId,
        correlationId,
        action: "withdrawal.payout_failed",
        subjectType: "withdrawal",
        subjectId: id,
        previousState: { state: "approved", payoutOutcome: "initiated" },
        newState: {
          state: "failed",
          payoutFailureId: failureId,
          reason,
          externalReference,
          idempotencyKey,
        },
      });
      await this.outbox.append([
        {
          id: newId(),
          name: "withdrawal.payout-failed",
          aggregateId: id,
          correlationId,
          occurredAt: new Date(),
          payload: {
            withdrawalId: id,
            payoutFailureId: failureId,
            accountId: withdrawal.accountId,
          },
        },
      ]);
      const failure = await this.withdrawals.findPayoutFailureByIdempotencyKey(idempotencyKey);
      if (!failure) throw new Error("Payout failure evidence was not persisted");
      return { failure, changed: true };
    });
  }
  async recordPayoutReturn(
    actorId: string,
    id: string,
    input: {
      amountMinor: string;
      reason: string;
      externalReference: string;
      idempotencyKey: string;
    },
  ) {
    await this.operators.requireCapability(actorId, "withdrawals.manage");
    if (!/^\d+$/.test(input.amountMinor) || BigInt(input.amountMinor) <= 0n)
      throw new PublicApplicationError("Returned amount must be positive.", "invalid_amount", 400);
    const reason = input.reason.trim();
    const externalReference = input.externalReference.trim();
    const idempotencyKey = input.idempotencyKey.trim();
    if (!reason || reason.length > 1000 || !externalReference || externalReference.length > 200)
      throw new PublicApplicationError(
        "Reason and provider reference are required.",
        "invalid_payout_return",
        400,
      );
    if (!idempotencyKey || idempotencyKey.length > 200)
      throw new PublicApplicationError(
        "A valid idempotency key is required.",
        "invalid_idempotency_key",
        400,
      );
    return this.uow.transaction(async () => {
      await this.withdrawals.lockPayoutReturnKey(idempotencyKey);
      const previous = await this.withdrawals.findPayoutReturnByIdempotencyKey(idempotencyKey);
      if (previous) {
        const matches =
          previous.withdrawalId === id &&
          previous.amountMinor === BigInt(input.amountMinor) &&
          previous.reason === reason &&
          previous.externalReference === externalReference &&
          previous.actorId === actorId;
        if (!matches)
          throw new PublicApplicationError(
            "Idempotency key was used for a different payout return.",
            "idempotency_conflict",
            409,
          );
        return { payoutReturn: previous, changed: false };
      }
      const withdrawal = await this.withdrawals.findByIdForUpdate(id);
      if (!withdrawal) throw new PublicApplicationError("Withdrawal not found.", "not_found", 404);
      const concurrentRetry =
        await this.withdrawals.findPayoutReturnByIdempotencyKey(idempotencyKey);
      if (concurrentRetry) {
        if (
          concurrentRetry.withdrawalId === id &&
          concurrentRetry.amountMinor === BigInt(input.amountMinor) &&
          concurrentRetry.reason === reason &&
          concurrentRetry.externalReference === externalReference &&
          concurrentRetry.actorId === actorId
        )
          return { payoutReturn: concurrentRetry, changed: false };
        throw new PublicApplicationError(
          "Idempotency key was used for a different payout return.",
          "idempotency_conflict",
          409,
        );
      }
      const priorReturn = await this.withdrawals.findPayoutReturnByWithdrawalId(id);
      if (priorReturn)
        throw new PublicApplicationError(
          "This withdrawal already has a recorded payout return.",
          "payout_return_exists",
          409,
        );
      if (withdrawal.state !== "completed")
        throw new PublicApplicationError(
          "Only a completed payout can be recorded as returned.",
          "invalid_transition",
          409,
        );
      const paidOutMinor = withdrawal.netAmount?.minorAmount ?? withdrawal.amount.minorAmount;
      if (BigInt(input.amountMinor) !== paidOutMinor)
        throw new PublicApplicationError(
          "A payout return must match the completed net payout amount.",
          "return_amount_mismatch",
          409,
        );
      const returnId = newId();
      const correlationId = newId();
      await this.withdrawals.recordPayoutReturn({
        id: returnId,
        withdrawalId: id,
        amountMinor: paidOutMinor,
        restoredMinor: withdrawal.amount.minorAmount,
        reason,
        externalReference,
        actorId,
        correlationId,
        idempotencyKey,
      });
      await this.funds.recordPayoutReturn({
        withdrawalId: id,
        accountId: withdrawal.accountId,
        correlationId,
        idempotencyKey: `payout-return:${idempotencyKey}`,
      });
      await this.debt?.settleInflow({
        accountId: withdrawal.accountId,
        incomingMinor: withdrawal.amount.minorAmount,
        wallet: "earnings",
        sourceKind: "payout_return",
        sourceId: returnId,
        reason: `Returned payout settled outstanding debt: ${reason}`,
        actor: { kind: "operator", id: actorId },
        correlationId,
        idempotencyKey: `debt-settlement:payout-return:${returnId}`,
      });
      await this.reconcileTreasuryFee(
        withdrawal,
        withdrawal.fee?.minorAmount ?? 0n,
        0n,
        correlationId,
        "reversal",
        actorId,
        "operator",
      );
      await this.withdrawals.markPayoutReturned(id, `Payout returned: ${reason}`);
      const payoutReturn = await this.withdrawals.findPayoutReturnByIdempotencyKey(idempotencyKey);
      if (!payoutReturn) throw new Error("Payout return evidence was not persisted");
      await this.audit.record({
        actorId,
        correlationId,
        action: "withdrawal.payout_returned",
        subjectType: "withdrawal",
        subjectId: id,
        previousState: { state: "completed", outstandingDebtSettled: true },
        newState: {
          state: "failed",
          payoutReturnId: returnId,
          returnedAmountMinor: paidOutMinor.toString(),
          restoredAmountMinor: withdrawal.amount.minorAmount.toString(),
          externalReference,
          reason,
          correlationId,
          idempotencyKey,
        },
      });
      await this.outbox.append([
        {
          id: newId(),
          name: "withdrawal.payout-returned",
          aggregateId: id,
          correlationId,
          occurredAt: new Date(),
          payload: { withdrawalId: id, payoutReturnId: returnId, accountId: withdrawal.accountId },
        },
      ]);
      return { payoutReturn, changed: true };
    });
  }
  override async update(actorId: string, id: string, input: WithdrawalUpdateInput) {
    const canManage = await this.operators.hasCapability(actorId, "withdrawals.manage");
    if (!canManage && input.state !== "cancelled")
      throw new PublicApplicationError("Forbidden", "forbidden", 403);
    return this.uow.transaction(async () => {
      const current = await this.withdrawals.findByIdForUpdate(id);
      if (!current) throw new PublicApplicationError("Withdrawal not found.", "not_found", 404);
      if (
        !canManage &&
        (current.accountId !== actorId ||
          input.amountMinor !== undefined ||
          input.destinationId !== undefined ||
          input.reason !== undefined)
      )
        throw new PublicApplicationError("Forbidden", "forbidden", 403);
      if (current.state !== "requested" && current.state !== "approved")
        throw new PublicApplicationError(
          "This withdrawal can no longer be edited.",
          "withdrawal_immutable",
          409,
        );
      const targetState = input.state ?? current.state;
      if (targetState === "cancelled") {
        if (!canManage && current.accountId !== actorId)
          throw new PublicApplicationError("Forbidden", "forbidden", 403);
        if (!canManage && current.state !== "requested")
          throw new PublicApplicationError(
            "This withdrawal cannot be cancelled by its owner after approval.",
            "invalid_transition",
            409,
          );
        if (await this.withdrawals.findPayoutInitiationByWithdrawalId(id))
          throw new PublicApplicationError(
            "An initiated payout cannot be cancelled before its external outcome is reconciled.",
            "payout_outcome_pending",
            409,
          );
        const reason =
          input.reason?.trim() || (canManage ? "Cancelled by operator" : "Cancelled by account");
        const cancellationCorrelationId = newId();
        const cancelled = {
          ...current,
          state: "cancelled" as const,
          reason,
          updatedAt: new Date(),
        };
        await this.withdrawals.update(cancelled, current.state);
        await this.funds.releaseOrComplete({
          withdrawalId: id,
          accountId: current.accountId,
          kind: "released",
          correlationId: cancellationCorrelationId,
        });
        await this.reconcileTreasuryFee(
          current,
          current.fee?.minorAmount ?? 0n,
          0n,
          cancellationCorrelationId,
          "reversal",
          actorId,
          canManage ? "operator" : "customer",
        );
        await this.outbox.append([
          {
            id: newId(),
            name: "withdrawal.cancelled",
            aggregateId: id,
            correlationId: cancellationCorrelationId,
            occurredAt: new Date(),
            payload: { withdrawalId: id, cancelledBy: actorId },
          },
        ]);
        await this.audit.record({
          actorId,
          correlationId: cancellationCorrelationId,
          action: "withdrawal.cancelled",
          subjectType: "withdrawal",
          subjectId: id,
          previousState: { state: current.state },
          newState: { state: "cancelled", reason },
        });
        return cancelled;
      }
      const amountMinorText = input.amountMinor ?? current.amount.minorAmount.toString();
      if (!/^\d+$/.test(amountMinorText) || BigInt(amountMinorText) <= 0n)
        throw new PublicApplicationError(
          "Withdrawal amount must be positive.",
          "invalid_amount",
          400,
        );
      const amountMinor = BigInt(amountMinorText);
      const destinationId = input.destinationId ?? current.destination.savedDestinationId;
      const reason = input.reason?.trim() || current.reason || "";
      const policy = await this.policy.getActive();
      if (
        current.state === "approved" &&
        (amountMinor !== current.amount.minorAmount ||
          destinationId !== current.destination.savedDestinationId)
      )
        throw new PublicApplicationError(
          "Amount and destination are locked after approval.",
          "withdrawal_immutable",
          409,
        );
      if (current.state === "approved" && targetState === "requested")
        throw new PublicApplicationError(
          "Approved withdrawals cannot return to requested.",
          "invalid_transition",
          409,
        );
      if (current.state === "requested" && !policy.enabled && targetState !== "rejected")
        throw new PublicApplicationError("Withdrawals are disabled.", "withdrawals_disabled", 409);
      if (
        current.state === "requested" &&
        targetState !== "rejected" &&
        amountMinor < policy.minimumAmount.minorAmount
      )
        throw new PublicApplicationError(
          "Withdrawal amount is below the minimum.",
          "invalid_amount",
          400,
        );
      if (
        current.state === "requested" &&
        targetState !== "rejected" &&
        policy.maximumAmount &&
        amountMinor > policy.maximumAmount.minorAmount
      )
        throw new PublicApplicationError(
          "Withdrawal amount exceeds the maximum.",
          "invalid_amount",
          400,
        );
      if (targetState === "rejected" && !reason)
        throw new PublicApplicationError("A rejection reason is required.", "reason_required", 400);

      if (current.state === "requested" && targetState === "approved")
        await this.debt?.requireNoOutstandingUnderLock(current.accountId, "withdrawal");

      const destination =
        current.state === "approved" || targetState === "rejected"
          ? current.destination
          : await this.destinations.resolveForWithdrawal(current.accountId, destinationId);
      const amount = Money.of(amountMinor, current.amount.currency);
      const amountChanged = amountMinor !== current.amount.minorAmount;
      const { feeMinor, netMinor } =
        current.state === "approved" || !amountChanged
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
      const operationCorrelationId = newId();
      if (
        current.state === "requested" &&
        targetState !== "rejected" &&
        amountMinor !== current.amount.minorAmount
      ) {
        try {
          await this.funds.resize({
            withdrawalId: id,
            accountId: current.accountId,
            amount,
            correlationId: operationCorrelationId,
          });
        } catch (cause) {
          if (cause instanceof Error && cause.message.includes("Insufficient available funds"))
            throw new PublicApplicationError(
              "Insufficient available earnings.",
              "insufficient_funds",
              409,
            );
          throw cause;
        }
      }
      if (current.state === "requested" && targetState !== "rejected" && amountChanged)
        await this.reconcileTreasuryFee(
          updated,
          current.fee?.minorAmount ?? 0n,
          feeMinor,
          operationCorrelationId,
          "edit",
          actorId,
          "operator",
        );
      if (current.state === "requested")
        await this.withdrawals.update({ ...updated, state: targetState }, "requested");

      if (current.state === "requested" && targetState !== "requested") {
        const target = targetState;
        if (target === "rejected") {
          await this.reconcileTreasuryFee(
            updated,
            feeMinor,
            0n,
            operationCorrelationId,
            "reversal",
            actorId,
            "operator",
          );
          await this.funds.releaseOrComplete({
            withdrawalId: id,
            accountId: current.accountId,
            kind: "released",
            correlationId: operationCorrelationId,
          });
        }
        await this.outbox.append([
          {
            id: newId(),
            name: target === "approved" ? "withdrawal.approved" : "withdrawal.rejected",
            aggregateId: id,
            correlationId: operationCorrelationId,
            occurredAt: new Date(),
            payload: { withdrawalId: id, updatedBy: actorId },
          },
        ]);
        const result = { ...updated, state: target };
        await this.audit.record({
          actorId,
          correlationId: operationCorrelationId,
          action: target === "approved" ? "withdrawal.approved" : "withdrawal.rejected",
          subjectType: "withdrawal",
          subjectId: id,
          previousState: { state: current.state },
          newState: { state: target, reason: target === "rejected" ? reason : null },
        });
        return result;
      }
      if (current.state === "approved" && targetState === "rejected") {
        if (await this.withdrawals.findPayoutInitiationByWithdrawalId(id))
          throw new PublicApplicationError(
            "An initiated payout cannot be rejected before its external outcome is reconciled.",
            "payout_outcome_pending",
            409,
          );
        await this.withdrawals.update({ ...updated, state: "rejected" }, "approved");
        await this.reconcileTreasuryFee(
          current,
          current.fee?.minorAmount ?? 0n,
          0n,
          operationCorrelationId,
          "reversal",
          actorId,
          "operator",
        );
        await this.funds.releaseOrComplete({
          withdrawalId: id,
          accountId: current.accountId,
          kind: "released",
          correlationId: operationCorrelationId,
        });
        await this.outbox.append([
          {
            id: newId(),
            name: "withdrawal.rejected",
            aggregateId: id,
            correlationId: operationCorrelationId,
            occurredAt: new Date(),
            payload: { withdrawalId: id, updatedBy: actorId },
          },
        ]);
        await this.audit.record({
          actorId,
          correlationId: operationCorrelationId,
          action: "withdrawal.rejected",
          subjectType: "withdrawal",
          subjectId: id,
          previousState: { state: "approved" },
          newState: { state: "rejected", reason },
        });
        return { ...updated, state: "rejected" as const };
      }
      const result = current.state === "approved" ? current : updated;
      if (result !== current)
        await this.audit.record({
          actorId,
          correlationId: operationCorrelationId,
          action: "withdrawal.updated",
          subjectType: "withdrawal",
          subjectId: id,
          previousState: {
            state: current.state,
            amountMinor: current.amount.minorAmount.toString(),
            destinationId: current.destination.savedDestinationId,
          },
          newState: {
            state: result.state,
            amountMinor: result.amount.minorAmount.toString(),
            destinationId: result.destination.savedDestinationId,
            reason: result.reason,
          },
        });
      return result;
    });
  }

  override async delete(actorId: string, id: string): Promise<{ id: string; deleted: true }> {
    await this.operators.requireCapability(actorId, "withdrawals.manage");
    return this.uow.transaction(async () => {
      const current = await this.withdrawals.findByIdForUpdate(id);
      if (!current) throw new PublicApplicationError("Withdrawal not found.", "not_found", 404);
      if (current.state === "completed")
        throw new PublicApplicationError(
          "A completed payout is immutable and cannot be deleted.",
          "withdrawal_immutable",
          409,
        );
      if (await this.withdrawals.findPayoutInitiationByWithdrawalId(id))
        throw new PublicApplicationError(
          "A withdrawal with external payout evidence cannot be deleted.",
          "withdrawal_immutable",
          409,
        );
      const operationCorrelationId = newId();
      if (!["requested", "approved", "rejected", "cancelled", "failed"].includes(current.state))
        throw new PublicApplicationError(
          "This withdrawal contains immutable payout history and cannot be deleted.",
          "withdrawal_immutable",
          409,
        );
      await this.funds.releaseOrComplete({
        withdrawalId: id,
        accountId: current.accountId,
        kind: "released",
        correlationId: operationCorrelationId,
      });
      await this.reconcileTreasuryFee(
        current,
        current.fee?.minorAmount ?? 0n,
        0n,
        operationCorrelationId,
        "reversal",
        actorId,
        "operator",
      );
      await this.funds.remove(id, current.accountId);
      await this.withdrawals.delete(id);
      await this.audit.record({
        actorId,
        correlationId: operationCorrelationId,
        action: "withdrawal.deleted",
        subjectType: "withdrawal",
        subjectId: id,
        previousState: {
          accountId: current.accountId,
          state: current.state,
          amountMinor: current.amount.minorAmount.toString(),
          currency: current.amount.currency,
        },
        newState: { deleted: true, mode: "physical", reservationReconciled: true },
      });
      return { id, deleted: true as const };
    });
  }

  private async reconcileTreasuryFee(
    withdrawal: Withdrawal,
    previousFee: bigint,
    nextFee: bigint,
    correlationId: string,
    operation: "request" | "edit" | "reversal",
    actorId: string,
    actorKind: "customer" | "operator",
  ) {
    const delta = nextFee - previousFee;
    if (delta === 0n) return;
    const idempotencyKey =
      operation === "reversal"
        ? `withdrawal:${withdrawal.id}:fee:reversal`
        : `withdrawal:${withdrawal.id}:fee:${operation}:${correlationId}`;
    if (operation === "reversal") {
      const existing = await this.treasury.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (
          existing.direction !== "debit" ||
          existing.amountMinor !== -delta ||
          existing.sourceKind !== "withdrawal_fee_reversal" ||
          existing.sourceId !== withdrawal.id
        )
          throw new PublicApplicationError(
            "The withdrawal fee reversal conflicts with its existing accounting record.",
            "withdrawal_fee_reversal_conflict",
            409,
          );
        return;
      }
      const [recognizedFees, reversedFees] = await Promise.all([
        this.treasury.sumBySource({
          sourceKind: "withdrawal_fee",
          sourceId: withdrawal.id,
          direction: "credit",
        }),
        this.treasury.sumBySource({
          sourceKind: "withdrawal_fee_reversal",
          sourceId: withdrawal.id,
          direction: "debit",
        }),
      ]);
      const remainingRecognizedFee = recognizedFees - reversedFees;
      if (remainingRecognizedFee <= 0n) return;
      if (-delta !== remainingRecognizedFee)
        throw new PublicApplicationError(
          "The withdrawal fee history does not match its current fee; reconcile it before reversal.",
          "withdrawal_fee_reversal_conflict",
          409,
        );
    }
    await this.treasury.create({
      id: newId(),
      direction: delta > 0n ? "credit" : "debit",
      amountMinor: delta > 0n ? delta : -delta,
      title: delta > 0n ? "Withdrawal fee" : "Withdrawal fee reversal",
      note: `Withdrawal ${withdrawal.id}; fee ${nextFee}`,
      sourceKind: delta > 0n ? "withdrawal_fee" : "withdrawal_fee_reversal",
      sourceId: withdrawal.id,
      idempotencyKey,
      actorId,
      actorKind,
      correlationId,
      createdAt: new Date(),
    });
  }
}
