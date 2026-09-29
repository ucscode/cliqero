import { randomBytes } from "node:crypto";
import type { AuthenticationService } from "@/application/identity/authentication";
import type { ProfileService } from "@/application/account/profile";
import type { AuditRecorder } from "@/application/shared/audit";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import { siteConfig } from "@/config/site";
import { PublicApplicationError } from "@/kernel/errors";

export interface OperatorAccountReader {
  get(accountId: string): Promise<{
    id: string;
    username: string;
    displayName: string | null;
    email: string | null;
    country: string | null;
    createdAt: string;
    deletedAt: string | null;
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

export interface OperatorAccountDeletionRepository {
  lockForDeletion(
    accountId: string,
    actorId: string,
  ): Promise<{
    accountId: string;
    deletedAt: string | null;
    isSystemRoot: boolean;
    actorIsSystemRoot: boolean;
    systemRootCount: number;
  } | null>;
  detachChildren(accountId: string): Promise<number>;
  archiveOwnedListings(accountId: string): Promise<number>;
  anonymizeWithdrawalDestinations(accountId: string): Promise<number>;
  revokeReferralAttributions(accountId: string): Promise<void>;
  revokeApiKeysAndSessions(accountId: string): Promise<void>;
  removeCapabilities(accountId: string): Promise<void>;
  tombstone(accountId: string): Promise<void>;
  removeHierarchyEdge(accountId: string): Promise<void>;
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
    private readonly deletion: OperatorAccountDeletionRepository,
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

  async delete(actorId: string, accountId: string): Promise<void> {
    if (actorId === accountId)
      throw new PublicApplicationError(
        "You cannot delete the account used for this request.",
        "account_self_delete_forbidden",
        409,
      );

    await this.uow.transaction(async () => {
      const target = await this.deletion.lockForDeletion(accountId, actorId);
      if (!target || target.deletedAt)
        throw new PublicApplicationError("Account not found", "not_found", 404);
      if (target.isSystemRoot && !target.actorIsSystemRoot)
        throw new PublicApplicationError(
          "Only a root operator can delete another root account.",
          "forbidden",
          403,
        );
      if (target.isSystemRoot && target.systemRootCount <= 1)
        throw new PublicApplicationError(
          "The final system.root account cannot be deleted.",
          "last_root_account",
          409,
        );
      const listingsArchived = await this.deletion.archiveOwnedListings(accountId);
      await this.deletion.anonymizeWithdrawalDestinations(accountId);
      await this.deletion.revokeReferralAttributions(accountId);
      await this.deletion.revokeApiKeysAndSessions(accountId);
      await this.deletion.removeCapabilities(accountId);
      await this.deletion.tombstone(accountId);
      const childrenDetached = await this.deletion.detachChildren(accountId);
      await this.deletion.removeHierarchyEdge(accountId);
      await this.authentication.removeAccountIdentity(accountId);
      await this.audit.record({
        actorId,
        action: "operator.account_deleted",
        subjectType: "account",
        subjectId: accountId,
        previousState: null,
        newState: {
          deleted: true,
          childrenDetached,
          listingsArchived,
          usernameReusable: true,
        },
      });
    });
  }
}
