import { describe, expect, it, vi } from "vitest";
import { OperatorAccountManagementService } from "@/application/operator/accounts";
import type { AuditRecordInput } from "@/application/shared/audit";
import { Account } from "@/modules/identity/account";

const actorId = "00000000-0000-4000-8000-000000000001";
const target = new Account("00000000-0000-4000-8000-000000000002", "new_user", "NG");

function fixture(options: { failReset?: boolean } = {}) {
  const audits: AuditRecordInput[] = [];
  const register = vi.fn(async (input: { email: string; username: string; password: string }) => {
    expect(input.password.length).toBeGreaterThanOrEqual(32);
    return target;
  });
  const requestPasswordSetup = vi.fn(async () => {
    if (options.failReset) throw new Error("email unavailable");
  });
  const updateProfile = vi.fn(async () => undefined);
  const authentication = {
    registerForOperator: register,
    requestPasswordSetup,
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
      directReferralCount: 0,
      parent: null,
      purchaseCount: 0,
      latestParentReassignment: null,
    }),
  };
  const service = new OperatorAccountManagementService(
    authentication as never,
    profiles as never,
    accounts as never,
    { record: async (input) => void audits.push(input) },
    { transaction: async (operation) => operation() },
  );
  return { service, audits, register, requestPasswordSetup, updateProfile };
}

describe("OperatorAccountManagementService", () => {
  it("creates through the trusted identity service and never returns a bootstrap password", async () => {
    const { service, register, requestPasswordSetup } = fixture();
    const created = await service.create(actorId, {
      email: "new@example.test",
      username: "new_user",
      country: "NG",
    });

    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ email: "new@example.test", username: "new_user", country: "NG" }),
      actorId,
    );
    expect(requestPasswordSetup).toHaveBeenCalledWith(
      "new@example.test",
      expect.stringMatching(/\/reset-password$/),
    );
    expect(created).toMatchObject({
      account: { id: target.id },
      passwordSetupEmailRequested: true,
    });
    expect(JSON.stringify(created)).not.toContain("generated-random-bootstrap-credential");
  });

  it("preserves successful account creation and reports reset-email delivery failure", async () => {
    const { service, audits } = fixture({ failReset: true });
    await expect(
      service.create(actorId, { email: "new@example.test", username: "new_user" }),
    ).resolves.toMatchObject({ account: { id: target.id }, passwordSetupEmailRequested: false });
    expect(audits).toHaveLength(0);
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
});
