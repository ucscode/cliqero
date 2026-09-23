import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { AccountReader } from "@/modules/identity/account";
import type { ReferralGraphRepository, ReferralParentAssigner } from "@/modules/referral/referral";
import type { AuditRecorder } from "@/application/shared/audit";

export class ReferralGraphService implements ReferralParentAssigner {
  constructor(
    private readonly accounts: AccountReader,
    private readonly graph: ReferralGraphRepository,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditRecorder,
  ) {}
  async establish(childAccountId: string, parentAccountId: string): Promise<void> {
    if (childAccountId === parentAccountId) throw new Error("Self-referral is not allowed");
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
    parentAccountId: string,
    actorAccountId: string,
  ): Promise<{
    childAccountId: string;
    parentAccountId: string;
    previousParentAccountId: string | null;
    changed: boolean;
  }> {
    if (childAccountId === parentAccountId) throw new Error("Self-referral is not allowed");
    return this.uow.transaction(async () => {
      const [childExists, parentExists] = await Promise.all([
        this.accounts.exists(childAccountId),
        this.accounts.exists(parentAccountId),
      ]);
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
