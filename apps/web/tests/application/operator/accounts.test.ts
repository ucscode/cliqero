import { describe, expect, it, vi } from "vitest";
import { OperatorAccountManagementService } from "@/application/operator/accounts";
import type { AuditRecordInput } from "@/application/shared/audit";
import { Account } from "@/modules/identity/account";

const actorId = "00000000-0000-4000-8000-000000000001";
const target = new Account("00000000-0000-4000-8000-000000000002", "new_user", "NG");

function fixture(options: { failReset?: boolean; deletionContext?: Record<string, unknown> } = {}) {
  const audits: AuditRecordInput[] = [];
  const register = vi.fn(async () => target);
  const registerWithoutPassword = vi.fn(async () => target);
  const requestPasswordSetup = vi.fn(async () => {
    if (options.failReset) throw new Error("email unavailable");
  });
  const updateProfile = vi.fn(async () => undefined);
  const authentication = {
    registerForOperator: register,
    registerForOperatorWithoutPassword: registerWithoutPassword,
    requestPasswordSetup,
    removeAccountIdentity: vi.fn(async () => undefined),
  };
  const profiles = {
    get: async () => ({
      email: "new@example.test",
      username: "new_user",
      displayName: null,
      country: "NG",
    }),
    update: updateProfile,
  };
  const accounts = {
    get: async () => ({
      id: target.id,
      username: "new_user",
      displayName: null,
      email: "new@example.test",
      country: "NG",
      createdAt: new Date().toISOString(),
      deletedAt: null,
      directReferralCount: 0,
      parent: null,
      purchaseCount: 0,
      latestParentReassignment: null,
    }),
  };
  const deletion = {
    lockForDeletion: vi.fn(async () => ({
      accountId: target.id,
      deletedAt: null,
      isSystemRoot: false,
      actorIsSystemRoot: false,
      systemRootCount: 1,
      ...options.deletionContext,
    })),
    detachChildren: vi.fn(async () => 2),
    archiveOwnedListings: vi.fn(async () => 1),
    anonymizeWithdrawalDestinations: vi.fn(async () => 1),
    revokeReferralAttributions: vi.fn(async () => undefined),
    revokeApiKeysAndSessions: vi.fn(async () => undefined),
    removeCapabilities: vi.fn(async () => undefined),
    tombstone: vi.fn(async () => undefined),
    removeHierarchyEdge: vi.fn(async () => undefined),
  };
  const service = new OperatorAccountManagementService(
    authentication as never,
    profiles as never,
    accounts as never,
    { record: async (input) => void audits.push(input) },
    { transaction: async (operation) => operation() },
    deletion,
  );
  return {
    service,
    audits,
    register,
    registerWithoutPassword,
    requestPasswordSetup,
    updateProfile,
    deletion,
    authentication,
  };
}

describe("OperatorAccountManagementService", () => {
  it("creates through the trusted identity service and never returns a bootstrap password", async () => {
    const { service, register, registerWithoutPassword, requestPasswordSetup } = fixture();
    const created = await service.create(actorId, {
      email: "new@example.test",
      username: "new_user",
      country: "NG",
      credentialSetup: { mode: "email" },
    });

    expect(registerWithoutPassword).toHaveBeenCalledWith(
      expect.objectContaining({ email: "new@example.test", username: "new_user", country: "NG" }),
      actorId,
    );
    expect(register).not.toHaveBeenCalled();
    expect(requestPasswordSetup).toHaveBeenCalledWith(
      "new@example.test",
      expect.stringMatching(/\/reset-password$/),
    );
    expect(created).toMatchObject({
      account: { id: target.id },
      credentialSetupMode: "email",
      passwordSetupEmailRequested: true,
    });
    expect(created).not.toHaveProperty("password");
  });

  it("preserves successful account creation and reports reset-email delivery failure", async () => {
    const { service, audits } = fixture({ failReset: true });
    await expect(
      service.create(actorId, {
        email: "new@example.test",
        username: "new_user",
        credentialSetup: { mode: "email" },
      }),
    ).resolves.toMatchObject({
      account: { id: target.id },
      credentialSetupMode: "email",
      passwordSetupEmailRequested: false,
    });
    expect(audits).toHaveLength(0);
  });

  it("creates a manual-password account without requesting email or returning the password", async () => {
    const { service, register, registerWithoutPassword, requestPasswordSetup } = fixture();
    const suppliedPassword = "OperatorChosenPassword!";
    const result = await service.create(actorId, {
      email: "new@example.test",
      username: "new_user",
      credentialSetup: { mode: "password", password: suppliedPassword },
    });

    expect(register).toHaveBeenCalledWith(
      { email: "new@example.test", username: "new_user", password: suppliedPassword },
      actorId,
    );
    expect(registerWithoutPassword).not.toHaveBeenCalled();
    expect(requestPasswordSetup).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      credentialSetupMode: "password",
      passwordSetupEmailRequested: false,
    });
    expect(JSON.stringify(result)).not.toContain(suppliedPassword);
  });

  it("updates only supported profile fields and records before/after audit state", async () => {
    const { service, audits, updateProfile } = fixture();
    await service.update(actorId, target.id, { username: "new_user", country: null });

    expect(updateProfile).toHaveBeenCalledWith(target.id, { username: "new_user", country: null });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId,
      action: "operator.account_profile_updated",
      subjectType: "account",
      subjectId: target.id,
      previousState: { username: "new_user", country: "NG" },
      newState: { username: "new_user", country: "NG" },
    });
  });

  it("coordinates tombstoning and auth removal while recording a PII-free audit fact", async () => {
    const { service, audits, deletion, authentication } = fixture();
    await service.delete(actorId, target.id);

    expect(deletion.tombstone.mock.invocationCallOrder[0]).toBeLessThan(
      deletion.detachChildren.mock.invocationCallOrder[0],
    );
    expect(deletion.detachChildren).toHaveBeenCalledWith(target.id);
    expect(deletion.archiveOwnedListings).toHaveBeenCalledWith(target.id);
    expect(deletion.anonymizeWithdrawalDestinations).toHaveBeenCalledWith(target.id);
    expect(deletion.tombstone).toHaveBeenCalledWith(target.id);
    expect(authentication.removeAccountIdentity).toHaveBeenCalledWith(target.id);
    expect(audits).toEqual([
      expect.objectContaining({
        actorId,
        action: "operator.account_deleted",
        subjectId: target.id,
        newState: {
          deleted: true,
          childrenDetached: 2,
          listingsArchived: 1,
          usernameReusable: true,
        },
      }),
    ]);
    expect(JSON.stringify(audits)).not.toContain("new_user");
    expect(JSON.stringify(audits)).not.toContain("new@example.test");
  });

  it("rejects self-deletion before opening the destructive workflow", async () => {
    const { service, deletion } = fixture();
    await expect(service.delete(target.id, target.id)).rejects.toMatchObject({
      code: "account_self_delete_forbidden",
      status: 409,
    });
    expect(deletion.lockForDeletion).not.toHaveBeenCalled();
  });

  it("protects the final system root account but allows hierarchy roots with descendants", async () => {
    const finalRoot = fixture({
      deletionContext: { isSystemRoot: true, actorIsSystemRoot: true, systemRootCount: 1 },
    });
    await expect(finalRoot.service.delete(actorId, target.id)).rejects.toMatchObject({
      code: "last_root_account",
      status: 409,
    });
    const hierarchyRoot = fixture();
    await expect(hierarchyRoot.service.delete(actorId, target.id)).resolves.toBeUndefined();
    expect(hierarchyRoot.deletion.detachChildren).toHaveBeenCalledWith(target.id);
  });

  it("allows deleting another root only when an independent root remains", async () => {
    const safeRoot = fixture({
      deletionContext: { isSystemRoot: true, actorIsSystemRoot: true, systemRootCount: 2 },
    });
    await expect(safeRoot.service.delete(actorId, target.id)).resolves.toBeUndefined();
    expect(safeRoot.deletion.tombstone).toHaveBeenCalledWith(target.id);

    const unauthorizedRoot = fixture({
      deletionContext: { isSystemRoot: true, actorIsSystemRoot: false, systemRootCount: 2 },
    });
    await expect(unauthorizedRoot.service.delete(actorId, target.id)).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
  });
});
