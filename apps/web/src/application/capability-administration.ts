import { PublicApplicationError } from "@/kernel/errors";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { SqlExecutor } from "@/infrastructure/postgres/database";
import {
  CAPABILITIES,
  canManageCapability,
  type Capability,
  isCapability,
} from "@/modules/identity/capabilities";

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
    private readonly sql: SqlExecutor,
    private readonly uow: UnitOfWork,
  ) {}

  async inspect(actorId: string, targetId: string): Promise<CapabilityAdministrationView> {
    const actorCapabilities = await this.loadCapabilities(actorId);
    if (!canManageCapability(actorCapabilities, "capabilities.manage"))
      throw forbidden("You are not allowed to inspect capability assignments.", "forbidden");

    await this.ensureAccount(targetId);
    const assignments = await this.assignments(targetId);
    return {
      accountId: targetId,
      assignments,
      manageableCapabilities: CAPABILITIES.filter((capability) =>
        canManageCapability(actorCapabilities, capability),
      ),
      isSelf: actorId === targetId,
    };
  }

  async grant(actorId: string, targetId: string, rawCapability: string) {
    return this.change(actorId, targetId, rawCapability, "grant");
  }

  async revoke(actorId: string, targetId: string, rawCapability: string) {
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
      const actorCapabilities = await this.loadCapabilities(actorId);
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

      if (capability === "system.root") await this.lockRootAssignments();

      if (action === "grant") {
        const inserted = await this.sql.query<{ granted_at: string }>(
          `insert into identity_capability.account_capabilities(account_id,capability)
           values((select id from identity_capability.accounts where uuid=$1),$2)
           on conflict (account_id,capability) do nothing
           returning granted_at`,
          [targetId, capability],
        );
        if (inserted.rowCount) {
          await this.audit(actorId, targetId, capability, "granted");
          return {
            accountId: targetId,
            capability,
            changed: true,
            assigned: true,
            grantedAt: inserted.rows[0].granted_at,
          };
        }
        const existing = await this.assignment(targetId, capability);
        return {
          accountId: targetId,
          capability,
          changed: false,
          assigned: true,
          grantedAt: existing,
        };
      }

      if (capability === "system.root") {
        const targetAssignment = await this.assignment(targetId, capability);
        if (!targetAssignment) {
          return {
            accountId: targetId,
            capability,
            changed: false,
            assigned: false,
            grantedAt: null,
          };
        }
        const roots = await this.sql.query<{ account_id: string }>(
          `select account_id from identity_capability.account_capabilities
           where capability='system.root' for update`,
        );
        if ((roots.rowCount ?? 0) <= 1)
          throw new PublicApplicationError(
            "At least one root account must remain.",
            "last_root_protected",
            409,
          );
      }
      const removed = await this.sql.query(
        `delete from identity_capability.account_capabilities
         where account_id=(select id from identity_capability.accounts where uuid=$1)
           and capability=$2`,
        [targetId, capability],
      );
      if (removed.rowCount) await this.audit(actorId, targetId, capability, "revoked");
      return {
        accountId: targetId,
        capability,
        changed: Boolean(removed.rowCount),
        assigned: false,
        grantedAt: null,
      };
    });
  }

  private async loadCapabilities(accountId: string): Promise<string[]> {
    const result = await this.sql.query<{ capability: string }>(
      `select ac.capability
       from identity_capability.account_capabilities ac
       join identity_capability.accounts a on a.id=ac.account_id
       where a.uuid=$1`,
      [accountId],
    );
    return result.rows.map((row) => row.capability);
  }

  private async ensureAccount(accountId: string) {
    const result = await this.sql.query(
      `select 1 from identity_capability.accounts where uuid=$1`,
      [accountId],
    );
    if (!result.rowCount)
      throw new PublicApplicationError("Account not found.", "account_not_found", 404);
  }

  private async assignments(accountId: string): Promise<CapabilityAssignment[]> {
    const result = await this.sql.query<{ capability: string; granted_at: string }>(
      `select ac.capability,ac.granted_at
       from identity_capability.account_capabilities ac
       join identity_capability.accounts a on a.id=ac.account_id
       where a.uuid=$1 order by ac.capability`,
      [accountId],
    );
    return result.rows
      .filter((row): row is { capability: Capability; granted_at: string } =>
        isCapability(row.capability),
      )
      .map((row) => ({ capability: row.capability, grantedAt: row.granted_at }));
  }

  private async assignment(accountId: string, capability: Capability): Promise<string | null> {
    const result = await this.sql.query<{ granted_at: string }>(
      `select ac.granted_at
       from identity_capability.account_capabilities ac
       join identity_capability.accounts a on a.id=ac.account_id
       where a.uuid=$1 and ac.capability=$2`,
      [accountId, capability],
    );
    return result.rows[0]?.granted_at ?? null;
  }

  private async lockRootAssignments() {
    await this.sql.query(`select pg_advisory_xact_lock(hashtext('cliqero:system-root'))`);
  }

  private async audit(
    actorId: string,
    targetId: string,
    capability: Capability,
    action: "granted" | "revoked",
  ) {
    await this.sql.query(
      `insert into kernel.audit_records(actor_id,action,subject_type,subject_id,previous_state,new_state,correlation_id)
       values((select id from identity_capability.accounts where uuid=$1),$2,'account_capability',$3,$4::jsonb,$5::jsonb,gen_random_uuid())`,
      [
        actorId,
        `capability.${action}`,
        targetId,
        action === "revoked" ? JSON.stringify({ capability, assigned: true }) : null,
        JSON.stringify({ capability, assigned: action === "granted" }),
      ],
    );
  }
}
