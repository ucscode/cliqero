import { PublicApplicationError } from "@/kernel/errors";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { AuditRecorder } from "@/application/shared/audit";
import type { AccountReader } from "@/modules/identity/account";
import {
  CAPABILITIES,
  canManageCapability,
  isCapability,
  type Capability,
} from "@/modules/identity/capabilities";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";

export type CapabilityAssignment = {
  capability: Capability;
  grantedAt: string;
};

export type CapabilityAdministrationView = {
  accountId: string;
  assignments: CapabilityAssignment[];
  manageableCapabilities: Capability[];
  isSelf: boolean;
};

export type CapabilityMutation = {
  accountId: string;
  capability: Capability;
  changed: boolean;
  assigned: boolean;
  grantedAt: string | null;
};

export interface CapabilityAssignmentStore {
  assignments(accountId: string): Promise<CapabilityAssignment[]>;
  assignment(accountId: string, capability: Capability): Promise<string | null>;
  lockRootAssignments(): Promise<number>;
  grant(accountId: string, capability: Capability): Promise<{ changed: boolean; grantedAt: string }>;
  revoke(accountId: string, capability: Capability): Promise<boolean>;
}

function capabilityOrThrow(value: string): Capability {
  if (!isCapability(value))
    throw new PublicApplicationError("That capability is not recognized.", "unknown_capability");
  return value;
}

function forbidden(message: string, code: string) {
  return new PublicApplicationError(message, code, 403);
}

export class CapabilityAdministrationService {
  constructor(
    private readonly accounts: AccountReader,
    private readonly operators: OperatorAuthorizationService,
    private readonly assignmentsStore: CapabilityAssignmentStore,
    private readonly audit: AuditRecorder,
    private readonly uow: UnitOfWork,
  ) {}

  async inspect(actorId: string, targetId: string): Promise<CapabilityAdministrationView> {
    const actorCapabilities = await this.operators.capabilities(actorId);
    if (!canManageCapability(actorCapabilities, "capabilities.manage"))
      throw forbidden("You are not allowed to inspect capability assignments.", "forbidden");
    await this.ensureAccount(targetId);
    return {
      accountId: targetId,
      assignments: await this.assignmentsStore.assignments(targetId),
      manageableCapabilities: CAPABILITIES.filter((capability) =>
        canManageCapability(actorCapabilities, capability),
      ),
      isSelf: actorId === targetId,
    };
  }

  grant(actorId: string, targetId: string, rawCapability: string) {
    return this.change(actorId, targetId, rawCapability, "grant");
  }

  revoke(actorId: string, targetId: string, rawCapability: string) {
    return this.change(actorId, targetId, rawCapability, "revoke");
  }

  private async change(
    actorId: string,
    targetId: string,
    rawCapability: string,
    action: "grant" | "revoke",
  ): Promise<CapabilityMutation> {
    const capability = capabilityOrThrow(rawCapability);
    return this.uow.transaction(async () => {
      const actorCapabilities = await this.operators.capabilities(actorId);
      if (!canManageCapability(actorCapabilities, capability)) {
        if (capability === "system.root")
          throw forbidden(
            "Only a root account can change system.root.",
            "root_authorization_required",
          );
        throw forbidden(
          "You can only delegate capabilities that you directly possess.",
          "capability_delegation_forbidden",
        );
      }
      await this.ensureAccount(targetId);
      const rootCount =
        capability === "system.root" ? await this.assignmentsStore.lockRootAssignments() : null;

      if (action === "grant") {
        const result = await this.assignmentsStore.grant(targetId, capability);
        if (result.changed) await this.recordAudit(actorId, targetId, capability, "granted");
        return {
          accountId: targetId,
          capability,
          changed: result.changed,
          assigned: true,
          grantedAt: result.grantedAt,
        };
      }

      const existing = await this.assignmentsStore.assignment(targetId, capability);
      if (!existing)
        return {
          accountId: targetId,
          capability,
          changed: false,
          assigned: false,
          grantedAt: null,
        };
      if (capability === "system.root" && (rootCount ?? 0) <= 1)
        throw new PublicApplicationError(
          "At least one root account must remain.",
          "last_root_protected",
          409,
        );
      const changed = await this.assignmentsStore.revoke(targetId, capability);
      if (changed) await this.recordAudit(actorId, targetId, capability, "revoked");
      return {
        accountId: targetId,
        capability,
        changed,
        assigned: false,
        grantedAt: null,
      };
    });
  }

  private async ensureAccount(accountId: string) {
    if (!(await this.accounts.exists(accountId)))
      throw new PublicApplicationError("Account not found.", "account_not_found", 404);
  }

  private recordAudit(
    actorId: string,
    targetId: string,
    capability: Capability,
    action: "granted" | "revoked",
  ) {
    return this.audit.record({
      actorId,
      action: `capability.${action}`,
      subjectType: "account_capability",
      subjectId: targetId,
      previousState: action === "revoked" ? { capability, assigned: true } : null,
      newState: { capability, assigned: action === "granted" },
    });
  }
}
