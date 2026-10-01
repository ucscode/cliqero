import { PublicApplicationError } from "@/kernel/errors";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import type { EarningsAdjustmentRepository } from "@/modules/ledger/earnings-adjustments";

export class EarningsAdjustmentService {
  constructor(
    private readonly repository: EarningsAdjustmentRepository,
    private readonly operators: OperatorAuthorizationService,
    private readonly uow: UnitOfWork,
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
    return this.uow.transaction(() =>
      this.repository.create({
        accountId: input.accountId,
        amountMinor: BigInt(input.amountMinor),
        reason,
        reference: input.reference?.trim() || null,
        actorId,
      }),
    );
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
}
