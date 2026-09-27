import { randomBytes } from "node:crypto";
import type { AuthenticationService } from "@/application/identity/authentication";
import type { ProfileService } from "@/application/account/profile";
import type { AuditRecorder } from "@/application/shared/audit";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import { siteConfig } from "@/config/site";

export interface OperatorAccountReader {
  get(accountId: string): Promise<{
    id: string;
    username: string;
    displayName: string | null;
    email: string | null;
    country: string | null;
    createdAt: string;
    directReferralCount: number;
    parent: { id: string; username: string; displayName: string | null } | null;
    purchaseCount: number;
    latestParentReassignment: {
      actorId: string | null;
      previousParentId: string | null;
      parentId: string | null;
      occurredAt: string;
    } | null;
  }>;
}

export type OperatorAccountProfileUpdate = {
  username?: string;
  country?: string | null;
};

/** Owns supported operator account creation and profile-update workflows. */
export class OperatorAccountManagementService {
  constructor(
    private readonly authentication: AuthenticationService,
    private readonly profiles: ProfileService,
    private readonly accounts: OperatorAccountReader,
    private readonly audit: AuditRecorder,
    private readonly uow: UnitOfWork,
  ) {}

  async create(
    actorId: string,
    input: { email: string; username: string; country?: string | null },
  ) {
    // The generated credential is never returned or persisted in plaintext.
    // The recipient chooses their own password through Better Auth's reset flow.
    const account = await this.authentication.registerForOperator(
      {
        ...input,
        password: randomBytes(32).toString("base64url"),
      },
      actorId,
    );

    let passwordSetupEmailRequested = true;
    try {
      await this.authentication.requestPasswordSetup(
        input.email,
        `${siteConfig.url}/reset-password`,
      );
    } catch {
      // Account creation is complete and audited. The recipient can still use
      // the public password-reset request if delivery is temporarily unavailable.
      passwordSetupEmailRequested = false;
    }

    return {
      account: await this.accounts.get(account.id),
      passwordSetupEmailRequested,
    };
  }

  async update(actorId: string, accountId: string, input: OperatorAccountProfileUpdate) {
    return this.uow.transaction(async () => {
      const previous = await this.accounts.get(accountId);
      await this.profiles.update(accountId, input);
      const updated = await this.accounts.get(accountId);
      await this.audit.record({
        actorId,
        action: "operator.account_profile_updated",
        subjectType: "account",
        subjectId: accountId,
        previousState: { username: previous.username, country: previous.country },
        newState: { username: updated.username, country: updated.country },
      });
      return updated;
    });
  }
}
