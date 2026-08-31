import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { AccountReader } from "@/modules/identity/account";
import type { ReferralGraphRepository } from "@/modules/referral/referral";
import type { SqlExecutor } from "@/infrastructure/postgres/database";

export class ReferralGraphService {
  constructor(
    private readonly accounts: AccountReader,
    private readonly graph: ReferralGraphRepository,
    private readonly uow: UnitOfWork,
    private readonly sql?: SqlExecutor,
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
    if (!this.sql) throw new Error("Referral audit storage is not configured");
    return this.uow.transaction(async () => {
      const [childExists, parentExists] = await Promise.all([
        this.accounts.exists(childAccountId),
        this.accounts.exists(parentAccountId),
      ]);
      if (!childExists || !parentExists) throw new Error("Referral account not found");
      const result = await this.graph.reassignParent(childAccountId, parentAccountId);
      if (result.changed) {
        await this.sql!.query(
          `insert into kernel.audit_records(actor_id,action,subject_type,subject_id,previous_state,new_state,correlation_id)
          values($1,'referral.parent_reassigned','account_referral',$2,$3::jsonb,$4::jsonb,gen_random_uuid())`,
          [
            actorAccountId,
            childAccountId,
            JSON.stringify({
              child_account_id: childAccountId,
              parent_account_id: result.previousParentId,
            }),
            JSON.stringify({
              child_account_id: childAccountId,
              parent_account_id: parentAccountId,
            }),
          ],
        );
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
