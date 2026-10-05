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
    },
  ) {
    await this.operators.requireCapability(actorId, "finance.manage");
    if (!/^-?\d+$/.test(input.amountMinor) || BigInt(input.amountMinor) === 0n)
      throw new PublicApplicationError(
        "Adjustment amount must be a non-zero minor-unit integer.",
        "invalid_adjustment",
        400,
      );
    const reason = input.reason.trim();
    if (!reason)
      throw new PublicApplicationError(
        "A reason is required for every earnings adjustment.",
        "reason_required",
        400,
      );
    return this.uow.transaction(async () => {
      const adjustment = await this.repository.create({
        accountId: input.accountId,
        amountMinor: BigInt(input.amountMinor),
        reason,
        reference: input.reference?.trim() || null,
        actorId,
      });
      const amountMinor = BigInt(input.amountMinor);
      if (amountMinor > 0n)
        await this.debt?.settleInflow({
          accountId: input.accountId,
          incomingMinor: amountMinor,
          wallet: "earnings",
          sourceKind: "earnings_adjustment",
          sourceId: adjustment.id,
          reason: "Positive earnings adjustment settled account debt before availability",
          actor: { kind: "account", id: actorId },
          correlationId: adjustment.id,
          idempotencyKey: `debt-settlement:earnings-adjustment:${adjustment.id}`,
        });
      return adjustment;
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
