import { describe, expect, it } from "vitest";
import {
  CapabilityAdministrationService,
  type CapabilityAssignmentStore,
} from "@/application/identity/capability-administration";
import type { AuditRecorder, AuditRecordInput } from "@/application/shared/audit";
import type { AccountReader } from "@/modules/identity/account";
import type { Capability } from "@/modules/identity/capabilities";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";

const ids = {
  actor: "00000000-0000-4000-8000-000000000001",
  target: "00000000-0000-4000-8000-000000000002",
  other: "00000000-0000-4000-8000-000000000003",
};

class FakeAssignments implements CapabilityAssignmentStore {
  readonly values = new Map<string, Map<Capability, string>>();

  async assignments(accountId: string) {
    return [...(this.values.get(accountId)?.entries() ?? [])].map(([capability, grantedAt]) => ({
      capability,
      grantedAt,
    }));
  }

  async assignment(accountId: string, capability: Capability) {
    return this.values.get(accountId)?.get(capability) ?? null;
  }

  async lockRootAssignments() {
    return [...this.values.values()].filter((assignments) => assignments.has("system.root")).length;
  }

  async grant(accountId: string, capability: Capability) {
    const assignments = this.values.get(accountId) ?? new Map<Capability, string>();
    this.values.set(accountId, assignments);
    const existing = assignments.get(capability);
    if (existing) return { changed: false, grantedAt: existing };
    const grantedAt = new Date().toISOString();
    assignments.set(capability, grantedAt);
    return { changed: true, grantedAt };
  }

  async revoke(accountId: string, capability: Capability) {
    return this.values.get(accountId)?.delete(capability) ?? false;
  }
}

function makeService() {
  const existingAccounts = new Set(Object.values(ids));
  const assignments = new FakeAssignments();
  const audits: AuditRecordInput[] = [];
  const accounts: AccountReader = { exists: async (id) => existingAccounts.has(id) };
  const operators: OperatorAuthorizationService = {
    capabilities: async (id) => [...(assignments.values.get(id)?.keys() ?? [])],
    hasCapability: async (id, capability) =>
      assignments.values.get(id)?.has(capability as Capability) ?? false,
    requireCapability: async () => undefined,
  };
  const audit: AuditRecorder = { record: async (input) => void audits.push(input) };
  const service = new CapabilityAdministrationService(accounts, operators, assignments, audit, {
    transaction: async (operation) => operation(),
  });
  return { service, assignments, audits };
}

describe("CapabilityAdministrationService", () => {
  it("enforces delegation and keeps grants idempotent", async () => {
    const { service, assignments, audits } = makeService();
    assignments.values.set(
      ids.actor,
      new Map<Capability, string>([
        ["capabilities.manage", new Date().toISOString()],
        ["catalogue.manage", new Date().toISOString()],
      ]),
    );
    expect((await service.grant(ids.actor, ids.target, "catalogue.manage")).changed).toBe(true);
    expect((await service.grant(ids.actor, ids.target, "catalogue.manage")).changed).toBe(false);
    await expect(service.grant(ids.actor, ids.target, "treasury.manage")).rejects.toMatchObject({
      code: "capability_delegation_forbidden",
    });
    expect(audits).toHaveLength(1);
  });

  it("allows root administration but protects the final root", async () => {
    const { service, assignments } = makeService();
    assignments.values.set(
      ids.actor,
      new Map<Capability, string>([["system.root", new Date().toISOString()]]),
    );
    await service.grant(ids.actor, ids.target, "system.root");
    await expect(service.revoke(ids.actor, ids.target, "system.root")).resolves.toMatchObject({
      changed: true,
    });
    await service.grant(ids.actor, ids.target, "system.root");
    await expect(service.revoke(ids.actor, ids.actor, "system.root")).resolves.toMatchObject({
      changed: true,
    });
    await expect(service.revoke(ids.target, ids.target, "system.root")).rejects.toMatchObject({
      code: "last_root_protected",
    });
  });

  it("reports direct assignments without expanding root authority", async () => {
    const { service, assignments } = makeService();
    assignments.values.set(
      ids.actor,
      new Map<Capability, string>([["system.root", new Date().toISOString()]]),
    );
    const view = await service.inspect(ids.actor, ids.actor);
    expect(view.assignments.map((item) => item.capability)).toEqual(["system.root"]);
    expect(view.manageableCapabilities).toContain("treasury.manage");
  });

  it("rejects capabilities outside the canonical registry", async () => {
    const { service } = makeService();
    await expect(service.grant(ids.actor, ids.target, "admin.superuser")).rejects.toMatchObject({
      code: "unknown_capability",
      status: 400,
    });
  });
});
