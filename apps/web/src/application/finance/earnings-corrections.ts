import { PublicApplicationError } from "@/kernel/errors";
import { newId } from "@/kernel/ids";
import type { AuditRecorder } from "@/application/shared/audit";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import type { AccountDebtService } from "@/application/finance/account-debt";
import type { EarningsCorrectionRepository } from "@/modules/ledger/earnings-corrections";

const MAX_MINOR = 9_223_372_036_854_775_807n;

export class EarningsCorrectionService {
  constructor(
    private readonly repository: EarningsCorrectionRepository,
    private readonly operators: OperatorAuthorizationService,
    private readonly debt: AccountDebtService,
    private readonly audit: AuditRecorder,
    private readonly uow: UnitOfWork,
  ) {}

  async create(
    actorId: string,
    input: { sourceEntryId: string; amountMinor: string; reason: string; idempotencyKey: string },
  ) {
    await this.operators.requireCapability(actorId, "finance.manage");
    const amountMinor = parseAmount(input.amountMinor);
    const reason = input.reason.trim();
    const idempotencyKey = input.idempotencyKey.trim();
    if (!reason || reason.length > 1000)
      throw new PublicApplicationError("A correction reason is required.", "reason_required", 400);
    if (!idempotencyKey || idempotencyKey.length > 200)
      throw new PublicApplicationError(
        "A valid Idempotency-Key is required.",
        "invalid_idempotency_key",
        400,
      );

    const observed = await this.repository.findSource(input.sourceEntryId);
    if (!observed)
      throw new PublicApplicationError(
        "Correctable purchase earning source not found.",
        "earning_source_not_found",
        404,
      );

    return this.uow.transaction(async () => {
      // Match the purchase reversal's aggregate lock, then the shared account lock
      // used by transfers, reservations, funding reversals, and debt settlement.
      if (!(await this.repository.lockPurchase(observed.purchaseId)))
        throw new PublicApplicationError("Purchase earning source not found.", "not_found", 404);
      await this.repository.lockAccount(observed.accountId);
      await this.repository.lockIdempotencyKey(idempotencyKey);
      const prior = await this.repository.findByIdempotencyKey(idempotencyKey);
      if (prior) {
        if (
          prior.sourceEntryId !== input.sourceEntryId ||
          prior.accountId !== observed.accountId ||
          BigInt(prior.amountMinor) !== amountMinor ||
          prior.reason !== reason ||
          prior.createdBy !== actorId
        )
          throw new PublicApplicationError(
            "Idempotency-Key was already used for a different Earnings correction.",
            "idempotency_conflict",
            409,
          );
        return { correction: prior, created: false };
      }

      const source = await this.repository.lockSource(input.sourceEntryId);
      if (!source)
        throw new PublicApplicationError("Purchase earning source not found.", "not_found", 404);
      if (source.reversed)
        throw new PublicApplicationError(
          "A reversed purchase earning cannot be corrected separately.",
          "earning_source_reversed",
          409,
        );
      if (source.remainingMinor <= 0n || amountMinor > source.remainingMinor)
        throw new PublicApplicationError(
          "Correction exceeds the source's remaining recoverable amount.",
          "correction_exceeds_source_remaining",
          409,
        );

      const id = newId();
      const correlationId = id;
      const pendingMinor =
        !source.settled && source.balanceState === "pending"
          ? min(amountMinor, source.remainingMinor)
          : 0n;
      const afterPending = amountMinor - pendingMinor;
      const availableMinor = min(
        afterPending,
        await this.repository.availableEarnings(source.accountId),
      );
      const debtMinor = afterPending - availableMinor;

      const correction = await this.repository.create({
        id,
        accountId: source.accountId,
        sourceEntryId: source.id,
        amountMinor,
        pendingMinor,
        availableMinor,
        debtMinor,
        reason,
        actorId,
        correlationId,
        idempotencyKey,
      });
      const sourceIsPending = pendingMinor > 0n;
      await this.repository.appendDebit({
        id: newId(),
        source,
        // The immutable ledger debit records the full source correction. The
        // available/debt split separately records what was physically recovered
        // versus retained as a debt obligation.
        amountMinor,
        balanceState: sourceIsPending ? "pending" : "available",
        maturityAt: sourceIsPending ? source.maturityAt : null,
        correctionId: id,
        correlationId,
        suffix: sourceIsPending ? "pending" : "available",
      });
      if (debtMinor > 0n)
        await this.debt.increase({
          accountId: source.accountId,
          amountMinor: debtMinor,
          wallet: "earnings",
          sourceKind: "earnings_correction",
          sourceId: id,
          reason: `Unrecovered Earnings correction: ${reason}`,
          actor: { kind: "operator", id: actorId },
          correlationId,
          idempotencyKey: `debt-increase:earnings-correction:${id}`,
        });
      await this.audit.record({
        actorId,
        correlationId,
        action: "earnings.correction.created",
        subjectType: "earnings_correction",
        subjectId: id,
        previousState: null,
        newState: correction,
      });
      return { correction, created: true };
    });
  }

  async list(actorId: string, input: { sourceEntryId?: string; cursor?: string; limit: number }) {
    await this.operators.requireCapability(actorId, "finance.read");
    return this.repository.list(input);
  }

  async get(actorId: string, id: string) {
    await this.operators.requireCapability(actorId, "finance.read");
    const correction = await this.repository.get(id);
    if (!correction)
      throw new PublicApplicationError("Earnings correction not found.", "not_found", 404);
    return correction;
  }
}

function parseAmount(value: string) {
  if (!/^[1-9][0-9]{0,18}$/.test(value))
    throw new PublicApplicationError(
      "amount_minor must be a positive USD minor-unit integer.",
      "invalid_amount",
      400,
    );
  const amount = BigInt(value);
  if (amount > MAX_MINOR)
    throw new PublicApplicationError("Correction amount is too large.", "invalid_amount", 400);
  return amount;
}

function min(left: bigint, right: bigint) {
  return left < right ? left : right;
}
