import { PublicApplicationError } from "@/kernel/errors";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import type { EarningsAdjustmentRepository } from "@/modules/ledger/earnings-adjustments";
import type { AccountDebtService } from "@/application/finance/account-debt";

export class EarningsAdjustmentService {
  constructor(
    private readonly repository: EarningsAdjustmentRepository,
    private readonly operators: OperatorAuthorizationService,
    private readonly uow: UnitOfWork,
    private readonly debt?: AccountDebtService,
  ) {}

  async create(
    actorId: string,
    input: {
      accountId: string;
      amountMinor: string;
      reason: string;
      reference?: string | null;
      idempotencyKey: string;
    },
  ) {
    await this.operators.requireCapability(actorId, "finance.manage");
    if (!/^\d{1,19}$/.test(input.amountMinor))
      throw new PublicApplicationError(
        "Manual Earnings adjustments must be positive. Recovering an earning requires a source-linked correction.",
        "source_linked_correction_required",
        400,
      );
    const requestedAmount = BigInt(input.amountMinor);
    if (requestedAmount <= 0n || requestedAmount > 9_223_372_036_854_775_807n)
      throw new PublicApplicationError(
        "Manual Earnings adjustments must be positive. Recovering an earning requires a source-linked correction.",
        "source_linked_correction_required",
        400,
      );
    const reason = input.reason.trim();
    if (!reason)
      throw new PublicApplicationError(
        "A reason is required for every earnings adjustment.",
        "reason_required",
        400,
      );
    const reference = input.reference?.trim() || null;
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 200)
      throw new PublicApplicationError(
        "A valid Idempotency-Key is required.",
        "invalid_idempotency_key",
        400,
      );
    return this.uow.transaction(async () => {
      await this.repository.lockIdempotencyKey(idempotencyKey);
      const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (
          existing.accountId !== input.accountId ||
          BigInt(existing.amountMinor) !== requestedAmount ||
          existing.reason !== reason ||
          existing.reference !== reference ||
          existing.createdBy !== actorId
        )
          throw new PublicApplicationError(
            "Idempotency-Key was already used for a different earnings adjustment.",
            "idempotency_conflict",
            409,
          );
        return { adjustment: existing, created: false };
      }
      const adjustment = await this.repository.create({
        accountId: input.accountId,
        amountMinor: requestedAmount,
        reason,
        reference,
        actorId,
        idempotencyKey,
      });
      const amountMinor = requestedAmount;
      if (amountMinor > 0n)
        await this.debt?.settleInflow({
          accountId: input.accountId,
          incomingMinor: amountMinor,
          wallet: "earnings",
          sourceKind: "earnings_adjustment",
          sourceId: adjustment.id,
          reason: "Positive earnings adjustment settled account debt before availability",
          actor: { kind: "operator", id: actorId },
          correlationId: adjustment.id,
          idempotencyKey: `debt-settlement:earnings-adjustment:${adjustment.id}`,
        });
      return { adjustment, created: true };
    });
  }

  async list(actorId: string, input: { search?: string; cursor?: string; limit: number }) {
    await this.operators.requireCapability(actorId, "finance.read");
    return this.repository.list(input);
  }

  async get(actorId: string, id: string) {
    await this.operators.requireCapability(actorId, "finance.read");
    const item = await this.repository.get(id);
    if (!item) throw new PublicApplicationError("Earnings adjustment not found.", "not_found", 404);
    return item;
  }

  async deleteForRoot(actorId: string, id: string) {
    await this.operators.requireCapability(actorId, "system.root");
    return this.uow.transaction(async () => {
      const item = await this.repository.get(id);
      if (!item)
        throw new PublicApplicationError("Earnings adjustment not found.", "not_found", 404);
      if (!(await this.repository.deleteForRoot(id, actorId)))
        throw new Error("Earnings adjustment not found");
      return { id, deleted: true };
    });
  }
}
