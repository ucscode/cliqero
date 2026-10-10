import { describe, expect, it, vi } from "vitest";
import { OperatorAccountManagementService } from "@/application/operator/accounts";
import type { AuditRecordInput } from "@/application/shared/audit";
import { Account } from "@/modules/identity/account";

const actorId = "00000000-0000-4000-8000-000000000001";
const target = new Account("00000000-0000-4000-8000-000000000002", "new_user", "NG");

function fixture(
  options: {
    failReset?: boolean;
    deletionContext?: Record<string, unknown>;
    targetRoot?: boolean;
    actorRoot?: boolean;
  } = {},
) {
  const audits: AuditRecordInput[] = [];
  let email = "new@example.test";
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
    sendOperatorAccountCreatedEmail: vi.fn(async () => undefined),
    removeAccountIdentity: vi.fn(async () => undefined),
    resetAccountPassword: vi.fn(async () => undefined),
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
    updateEmail: vi.fn(async (_accountId: string, nextEmail: string) => {
      email = nextEmail;
    }),
    get: async () => ({
      id: target.id,
      username: "new_user",
      displayName: null,
      email,
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
  const operators = {
    requireCapability: vi.fn(async () => undefined),
    hasCapability: vi.fn(
      async (id: string, capability: string) =>
        capability === "system.root" &&
        Boolean(id === actorId ? options.actorRoot : options.targetRoot),
    ),
    capabilities: vi.fn(async () => []),
  };
  const service = new OperatorAccountManagementService(
    authentication as never,
    profiles as never,
    accounts as never,
    { record: async (input) => void audits.push(input) },
    { transaction: async (operation) => operation() },
    deletion,
    operators,
  );
  return {
    service,
    audits,
    register,
    registerWithoutPassword,
    requestPasswordSetup,
    sendOperatorAccountCreatedEmail: vi.fn(async () => undefined),
    updateProfile,
    accounts,
    deletion,
    authentication,
    operators,
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
      notifyUser: true,
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

  it("resets an eligible account password through the identity boundary and audits no secret", async () => {
    const { service, audits, authentication } = fixture();
    await service.resetPassword(actorId, target.id, "a-new-long-password");
    expect(authentication.resetAccountPassword).toHaveBeenCalledWith(
      target.id,
      "a-new-long-password",
    );
    expect(audits.at(-1)).toMatchObject({
      actorId,
      action: "operator.account_password_reset",
      subjectId: target.id,
      newState: { credential: "password", passwordRecorded: false, sessionsRevoked: true },
    });
    expect(JSON.stringify(audits)).not.toContain("a-new-long-password");
  });

  it("requires root authority to reset another root account", async () => {
    const { service, authentication, audits } = fixture({ targetRoot: true });
    await expect(
      service.resetPassword(actorId, target.id, "a-new-long-password"),
    ).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
    expect(authentication.resetAccountPassword).not.toHaveBeenCalled();
    expect(audits).toHaveLength(0);
  });

  it("allows a root operator to reset a root account through the same audited workflow", async () => {
    const { service, authentication, audits } = fixture({ targetRoot: true, actorRoot: true });
    await service.resetPassword(actorId, target.id, "a-new-long-password");
    expect(authentication.resetAccountPassword).toHaveBeenCalledOnce();
    expect(audits).toHaveLength(1);
  });

  it("preserves successful account creation and reports reset-email delivery failure", async () => {
    const { service, audits } = fixture({ failReset: true });
    await expect(
      service.create(actorId, {
        email: "new@example.test",
        username: "new_user",
        credentialSetup: { mode: "email" },
        notifyUser: true,
      }),
    ).resolves.toMatchObject({
      account: { id: target.id },
      credentialSetupMode: "email",
      passwordSetupEmailRequested: false,
    });
    expect(audits).toHaveLength(0);
  });

  it("creates a manual-password account without email unless notification is requested", async () => {
    const { service, register, registerWithoutPassword, requestPasswordSetup, authentication } =
      fixture();
    const suppliedPassword = "OperatorChosenPassword!";
    const result = await service.create(actorId, {
      email: "new@example.test",
      username: "new_user",
      credentialSetup: { mode: "password", password: suppliedPassword },
      notifyUser: false,
    });

    expect(register).toHaveBeenCalledWith(
      { email: "new@example.test", username: "new_user", password: suppliedPassword },
      actorId,
    );
    expect(registerWithoutPassword).not.toHaveBeenCalled();
    expect(requestPasswordSetup).not.toHaveBeenCalled();
    expect(authentication.sendOperatorAccountCreatedEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      credentialSetupMode: "password",
      passwordSetupEmailRequested: false,
      accountCreatedEmailRequested: false,
    });
    expect(JSON.stringify(result)).not.toContain(suppliedPassword);
  });

  it("sends a password-free account notification only when explicitly selected", async () => {
    const { service, authentication } = fixture();
    await service.create(actorId, {
      email: "new@example.test",
      username: "new_user",
      credentialSetup: { mode: "password", password: "OperatorChosenPassword!" },
      notifyUser: true,
    });
    expect(authentication.sendOperatorAccountCreatedEmail).toHaveBeenCalledWith(
      target.id,
      "new@example.test",
      "new_user",
    );
    expect(authentication.sendOperatorAccountCreatedEmail.mock.calls[0].join(" ")).not.toContain(
      "OperatorChosenPassword!",
    );
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

  it("updates the canonical email identity and audits the normalized before/after values", async () => {
    const { service, accounts, audits, updateProfile } = fixture();
    await expect(
      service.update(actorId, target.id, { email: "  New.Address@example.test  " }),
    ).resolves.toMatchObject({ email: "new.address@example.test" });

    expect(accounts.updateEmail).toHaveBeenCalledWith(target.id, "new.address@example.test");
    expect(updateProfile).toHaveBeenCalledWith(target.id, {
      email: "  New.Address@example.test  ",
    });
    expect(audits[0]).toMatchObject({
      previousState: { email: "new@example.test" },
      newState: { email: "new.address@example.test" },
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
