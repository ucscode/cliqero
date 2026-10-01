import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { AccountReader } from "@/modules/identity/account";
import type { ReferralGraphRepository, ReferralParentAssigner } from "@/modules/referral/referral";
import type { AuditRecorder } from "@/application/shared/audit";
import { PublicApplicationError } from "@/kernel/errors";

export class ReferralGraphService implements ReferralParentAssigner {
  constructor(
    private readonly accounts: AccountReader,
    private readonly graph: ReferralGraphRepository,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditRecorder,
  ) {}
  async establish(childAccountId: string, parentAccountId: string): Promise<void> {
    if (childAccountId === parentAccountId)
      throw new PublicApplicationError("Self-referral is not allowed.", "self_referral", 400);
    if (await this.graph.wouldCreateCycle(childAccountId, parentAccountId))
      throw new PublicApplicationError(
        "Referral relationship would create a cycle.",
        "referral_cycle",
        400,
      );
    await this.uow.transaction(async () => {
      const [childExists, parentExists] = await Promise.all([
        this.accounts.exists(childAccountId),
        this.accounts.exists(parentAccountId),
      ]);
      if (!childExists || !parentExists) throw new Error("Referral account not found");
      await this.graph.assignParent(childAccountId, parentAccountId);
    });
  }
  async reassignParent(
    childAccountId: string,
    parentAccountId: string | null,
    actorAccountId: string,
  ): Promise<{
    childAccountId: string;
    parentAccountId: string | null;
    previousParentAccountId: string | null;
    changed: boolean;
  }> {
    if (parentAccountId === childAccountId)
      throw new PublicApplicationError("Self-referral is not allowed.", "self_referral", 400);
    if (
      parentAccountId !== null &&
      (await this.graph.wouldCreateCycle(childAccountId, parentAccountId))
    )
      throw new PublicApplicationError(
        "Referral relationship would create a cycle.",
        "referral_cycle",
        400,
      );
    return this.uow.transaction(async () => {
      const childExists = await this.accounts.exists(childAccountId);
      const parentExists =
        parentAccountId === null || (await this.accounts.exists(parentAccountId));
      if (!childExists || !parentExists) throw new Error("Referral account not found");
      const result = await this.graph.reassignParent(childAccountId, parentAccountId);
      if (result.changed) {
        await this.audit.record({
          actorId: actorAccountId,
          action: "referral.parent_reassigned",
          subjectType: "account_referral",
          subjectId: childAccountId,
          previousState: {
            child_account_id: childAccountId,
            parent_account_id: result.previousParentId,
          },
          newState: {
            child_account_id: childAccountId,
            parent_account_id: parentAccountId,
          },
        });
      }
      return {
        childAccountId,
        parentAccountId,
        previousParentAccountId: result.previousParentId,
        changed: result.changed,
      };
    });
  }
}
