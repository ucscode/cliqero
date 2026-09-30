import { PublicApplicationError } from "@/kernel/errors";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { AuditRecorder } from "@/application/shared/audit";
import type { AccountReader } from "@/modules/identity/account";
import { hasCapability } from "@/modules/identity/capabilities";
import type { OperatorAuthorizationService } from "@/modules/identity/operator";
import {
  API_SCOPES,
  assertApiScopes,
  operatorCapabilitiesForScope,
  type ApiScope,
} from "@/modules/identity/api/scopes";
import type { ApiKeyManagementService } from "@/modules/identity/api/keys";

export type OperatorApiKeyInput = {
  name?: string;
  scopes?: string[];
  expiresAt?: Date | null;
};

function forbidden(message: string, code = "forbidden") {
  return new PublicApplicationError(message, code, 403);
}

export class OperatorApiKeyService {
  constructor(
    private readonly apiKeys: ApiKeyManagementService,
    private readonly accounts: AccountReader,
    private readonly operators: OperatorAuthorizationService,
    private readonly audit: AuditRecorder,
    private readonly uow: UnitOfWork,
  ) {}

  async list(
    actorId: string,
    targetId: string,
    order?: { sort?: "created" | "name" | "expires"; direction?: "asc" | "desc" },
  ) {
    const actorCapabilities = await this.operators.capabilities(actorId);
    if (!hasCapability(actorCapabilities, "api_keys.manage"))
      throw forbidden("You are not allowed to administer API keys.");
    await this.ensureAccount(targetId);
    const targetCapabilities = await this.operators.capabilities(targetId);
    return {
      items: await this.apiKeys.list(targetId, order),
      manageableScopes: this.manageableScopes(actorCapabilities, targetCapabilities),
    };
  }

  async listAll(
    actorId: string,
    input: {
      accountId?: string;
      search?: string;
      state?: "active" | "expired" | "deleted" | "all";
      sort?: "created" | "name" | "expires";
      direction?: "asc" | "desc";
    } = {},
  ) {
    const actorCapabilities = await this.requireManager(actorId);
    const all = await this.apiKeys.list(input.accountId, input, input);
    const items = [];
    for (const key of all) {
      const targetCapabilities = await this.operators.capabilities(key.accountId);
      try {
        this.authorizeScopes(
          actorCapabilities,
          targetCapabilities,
          this.validateScopes(key.scopes),
        );
        items.push(key);
      } catch {
        // Keys carrying scopes the actor cannot administer are outside this collection.
      }
    }
    const target = input.accountId ? await this.scopesForTarget(actorId, input.accountId) : [];
    return { items, manageableScopes: target };
  }

  /** Session-facing entry point shared by operator and future account-holder UI. */
  async listForSession(
    actorId: string,
    input: {
      accountId?: string;
      search?: string;
      state?: "active" | "expired" | "deleted" | "all";
      sort?: "created" | "name" | "expires";
      direction?: "asc" | "desc";
    } = {},
  ) {
    const actorCapabilities = await this.operators.capabilities(actorId);
    if (hasCapability(actorCapabilities, "api_keys.manage")) return this.listAll(actorId, input);
    this.requireSelfManagement(actorCapabilities);
    if (input.accountId && input.accountId !== actorId) return this.keyNotFound();

    const targetCapabilities = actorCapabilities;
    const all = await this.apiKeys.list(actorId, input, input);
    const items = all.filter((key) => {
      try {
        this.authorizeScopes(
          actorCapabilities,
          targetCapabilities,
          this.validateScopes(key.scopes),
        );
        return true;
      } catch {
        return false;
      }
    });
    return {
      items,
      manageableScopes: this.manageableScopes(actorCapabilities, targetCapabilities),
    };
  }

  async getForSession(actorId: string, keyId: string) {
    const actorCapabilities = await this.operators.capabilities(actorId);
    if (hasCapability(actorCapabilities, "api_keys.manage")) return this.get(actorId, keyId);
    this.requireSelfManagement(actorCapabilities);
    const key = await this.apiKeys.find(keyId, actorId);
    if (!key) return this.keyNotFound();
    this.authorizeScopes(actorCapabilities, actorCapabilities, this.validateScopes(key.scopes));
    return key;
  }

  async createForSession(
    actorId: string,
    input: Required<Pick<OperatorApiKeyInput, "name" | "scopes">> &
      Pick<OperatorApiKeyInput, "expiresAt"> & { accountId?: string },
  ) {
    const actorCapabilities = await this.operators.capabilities(actorId);
    if (hasCapability(actorCapabilities, "api_keys.manage")) {
      if (!input.accountId)
        throw new PublicApplicationError("Target account is required.", "invalid_request", 400);
      return this.create(actorId, input.accountId, input);
    }

    this.requireSelfManagement(actorCapabilities);
    if (input.accountId && input.accountId !== actorId) return this.keyNotFound();
    return this.createForAccount(actorId, actorId, input, actorCapabilities);
  }

  async updateForSession(actorId: string, keyId: string, input: OperatorApiKeyInput) {
    const actorCapabilities = await this.operators.capabilities(actorId);
    if (hasCapability(actorCapabilities, "api_keys.manage"))
      return this.update(actorId, keyId, input);
    this.requireSelfManagement(actorCapabilities);
    return this.updateOwned(
      actorId,
      keyId,
      input,
      async () => {
        const key = await this.apiKeys.find(keyId, actorId);
        if (!key) return this.keyNotFound();
        return key;
      },
      actorCapabilities,
    );
  }

  async revokeForSession(actorId: string, keyId: string) {
    const actorCapabilities = await this.operators.capabilities(actorId);
    if (hasCapability(actorCapabilities, "api_keys.manage")) {
      const key = await this.get(actorId, keyId);
      return this.revoke(actorId, key.accountId, key.id);
    }
    this.requireSelfManagement(actorCapabilities);
    const key = await this.apiKeys.find(keyId, actorId);
    if (!key) return this.keyNotFound();
    return this.revokeForAccount(actorId, actorId, keyId, actorCapabilities);
  }

  async get(actorId: string, keyId: string) {
    const actorCapabilities = await this.requireManager(actorId);
    const key = await this.apiKeys.find(keyId);
    if (!key) throw new PublicApplicationError("API key not found.", "not_found", 404);
    const targetCapabilities = await this.operators.capabilities(key.accountId);
    this.authorizeScopes(actorCapabilities, targetCapabilities, this.validateScopes(key.scopes));
    return key;
  }

  async update(actorId: string, keyId: string, input: OperatorApiKeyInput) {
    return this.updateOwned(actorId, keyId, input, () => this.get(actorId, keyId));
  }

  private async updateOwned(
    actorId: string,
    keyId: string,
    input: OperatorApiKeyInput,
    loadKey: () => Promise<Awaited<ReturnType<OperatorApiKeyService["get"]>>>,
    authorizedActorCapabilities?: readonly string[],
  ) {
    return this.uow.transaction(async () => {
      const key = await loadKey();
      if (key.revokedAt) throw new PublicApplicationError("API key is deleted.", "not_found", 404);
      const actorCapabilities =
        authorizedActorCapabilities ?? (await this.operators.capabilities(actorId));
      const targetCapabilities = await this.operators.capabilities(key.accountId);
      const scopes =
        input.scopes === undefined
          ? this.validateScopes(key.scopes)
          : this.validateScopes(input.scopes);
      this.authorizeScopes(actorCapabilities, targetCapabilities, scopes);
      const name = input.name === undefined ? key.name : input.name.trim();
      if (!name)
        throw new PublicApplicationError("API-key name is required.", "invalid_request", 400);
      const expiresAt = input.expiresAt === undefined ? key.expiresAt : input.expiresAt;
      if (expiresAt && expiresAt <= new Date())
        throw new PublicApplicationError("Expiry must be in the future.", "invalid_request", 400);
      if (!(await this.apiKeys.update(keyId, { name, scopes, expiresAt })))
        throw new PublicApplicationError("API key not found.", "not_found", 404);
      const updated = await this.apiKeys.find(keyId);
      await this.audit.record({
        actorId,
        action: "api_key.updated",
        subjectType: "api_key",
        subjectId: keyId,
        previousState: {
          name: key.name,
          scopes: key.scopes,
          expiresAt: key.expiresAt?.toISOString() ?? null,
        },
        newState: { name, scopes, expiresAt: expiresAt?.toISOString() ?? null },
      });
      return updated!;
    });
  }

  private async scopesForTarget(actorId: string, targetId: string) {
    const result = await this.list(actorId, targetId);
    return result.manageableScopes;
  }

  private async requireManager(actorId: string) {
    const capabilities = await this.operators.capabilities(actorId);
    if (!hasCapability(capabilities, "api_keys.manage"))
      throw forbidden("You are not allowed to administer API keys.");
    return capabilities;
  }

  private requireSelfManagement(capabilities: readonly string[]) {
    if (!hasCapability(capabilities, "api_keys.self_manage"))
      throw forbidden("You are not allowed to administer API keys.");
  }

  async create(
    actorId: string,
    targetId: string,
    input: Required<Pick<OperatorApiKeyInput, "name" | "scopes">> &
      Pick<OperatorApiKeyInput, "expiresAt">,
  ) {
    const actorCapabilities = await this.operators.capabilities(actorId);
    if (!hasCapability(actorCapabilities, "api_keys.manage"))
      throw forbidden("You are not allowed to administer API keys.");
    const targetCapabilities = await this.operators.capabilities(targetId);
    return this.createForAccount(actorId, targetId, input, actorCapabilities, targetCapabilities);
  }

  private async createForAccount(
    actorId: string,
    targetId: string,
    input: Required<Pick<OperatorApiKeyInput, "name" | "scopes">> &
      Pick<OperatorApiKeyInput, "expiresAt">,
    actorCapabilities: readonly string[],
    knownTargetCapabilities?: readonly string[],
  ) {
    return this.uow.transaction(async () => {
      await this.ensureAccount(targetId);
      const targetCapabilities =
        knownTargetCapabilities ?? (await this.operators.capabilities(targetId));
      const scopes = this.validateScopes(input.scopes);
      this.authorizeScopes(actorCapabilities, targetCapabilities, scopes);
      const name = input.name.trim();
      if (!name)
        throw new PublicApplicationError("API-key name is required.", "invalid_request", 400);
      if (input.expiresAt && input.expiresAt <= new Date())
        throw new PublicApplicationError("Expiry must be in the future.", "invalid_request", 400);
      const created = await this.apiKeys.create({
        accountId: targetId,
        name,
        scopes,
        createdBy: actorId,
        expiresAt: input.expiresAt ?? null,
      });
      await this.audit.record({
        actorId,
        action: "api_key.created",
        subjectType: "api_key",
        subjectId: created.id,
        previousState: null,
        newState: {
          target_account_id: targetId,
          name: created.name,
          key_prefix: created.keyPrefix,
          scopes: created.scopes,
          expires_at: created.expiresAt?.toISOString() ?? null,
          active: true,
        },
      });
      return created;
    });
  }

  async revoke(actorId: string, targetId: string, keyId: string) {
    return this.uow.transaction(async () => {
      const actorCapabilities = await this.operators.capabilities(actorId);
      if (!hasCapability(actorCapabilities, "api_keys.manage"))
        throw forbidden("You are not allowed to administer API keys.");
      await this.ensureAccount(targetId);
      const key = await this.apiKeys.find(keyId, targetId);
      if (!key) throw new PublicApplicationError("API key not found.", "not_found", 404);
      if (key.revokedAt) return { changed: false, key };
      const targetCapabilities = await this.operators.capabilities(targetId);
      this.authorizeScopes(actorCapabilities, targetCapabilities, this.validateScopes(key.scopes));
      const changed = await this.apiKeys.revoke(keyId, targetId);
      if (changed) {
        const state = {
          target_account_id: targetId,
          name: key.name,
          key_prefix: key.keyPrefix,
          scopes: key.scopes,
        };
        await this.audit.record({
          actorId,
          action: "api_key.revoked",
          subjectType: "api_key",
          subjectId: keyId,
          previousState: { ...state, active: true },
          newState: { ...state, active: false },
        });
      }
      return { changed, key };
    });
  }

  /** Revoke selected keys server-side, rechecking operator authority per key. */
  async bulkDeleteForOperator(actorId: string, keyIds: readonly string[]) {
    const actorCapabilities = await this.operators.capabilities(actorId);
    if (!hasCapability(actorCapabilities, "api_keys.manage"))
      throw forbidden("You are not allowed to administer API keys.");

    const outcome: { succeeded: string[]; failed: Array<{ id: string; message: string }> } = {
      succeeded: [],
      failed: [],
    };
    for (const keyId of new Set(keyIds)) {
      try {
        const key = await this.apiKeys.find(keyId);
        if (!key) throw new PublicApplicationError("API key not found.", "not_found", 404);
        if (key.revokedAt)
          throw new PublicApplicationError("API key is already deleted.", "not_found", 404);
        const result = await this.revoke(actorId, key.accountId, key.id);
        if (!result.changed)
          throw new PublicApplicationError("API key is already deleted.", "not_found", 404);
        outcome.succeeded.push(keyId);
      } catch (error) {
        outcome.failed.push({
          id: keyId,
          message: error instanceof Error ? error.message : "Unable to delete this API key.",
        });
      }
    }
    return outcome;
  }

  private async revokeForAccount(
    actorId: string,
    targetId: string,
    keyId: string,
    actorCapabilities: readonly string[],
  ) {
    return this.uow.transaction(async () => {
      await this.ensureAccount(targetId);
      const key = await this.apiKeys.find(keyId, targetId);
      if (!key) return this.keyNotFound();
      this.authorizeScopes(actorCapabilities, actorCapabilities, this.validateScopes(key.scopes));
      if (key.revokedAt) return { changed: false, key };
      const changed = await this.apiKeys.revoke(keyId, targetId);
      if (changed)
        await this.audit.record({
          actorId,
          action: "api_key.revoked",
          subjectType: "api_key",
          subjectId: keyId,
          previousState: {
            target_account_id: targetId,
            name: key.name,
            scopes: key.scopes,
            active: true,
          },
          newState: {
            target_account_id: targetId,
            name: key.name,
            scopes: key.scopes,
            active: false,
          },
        });
      return { changed, key };
    });
  }

  private manageableScopes(
    actorCapabilities: readonly string[],
    targetCapabilities: readonly string[],
  ) {
    const root = hasCapability(actorCapabilities, "system.root");
    return API_SCOPES.filter((scope) => {
      const required = operatorCapabilitiesForScope(scope);
      return (
        !required.length ||
        (required.every((capability) => hasCapability(targetCapabilities, capability)) &&
          (root || required.every((capability) => hasCapability(actorCapabilities, capability))))
      );
    });
  }

  private keyNotFound(): never {
    throw new PublicApplicationError("API key not found.", "not_found", 404);
  }

  private validateScopes(rawScopes: readonly string[]): ApiScope[] {
    try {
      return [...assertApiScopes(rawScopes)];
    } catch {
      throw new PublicApplicationError(
        "One or more API-key scopes are not recognized.",
        "unknown_scope",
      );
    }
  }

  private authorizeScopes(
    actorCapabilities: readonly string[],
    targetCapabilities: readonly string[],
    scopes: readonly ApiScope[],
  ) {
    const root = hasCapability(actorCapabilities, "system.root");
    for (const scope of scopes) {
      const required = operatorCapabilitiesForScope(scope);
      if (!required.length) continue;
      if (!root && !required.every((capability) => hasCapability(actorCapabilities, capability)))
        throw forbidden(
          `You cannot assign the ${scope} scope without the corresponding account authority.`,
          "scope_delegation_forbidden",
        );
      if (!required.every((capability) => hasCapability(targetCapabilities, capability)))
        throw forbidden(
          `The target account does not have authority for the ${scope} scope.`,
          "target_scope_forbidden",
        );
    }
  }

  private async ensureAccount(accountId: string) {
    if (!(await this.accounts.exists(accountId)))
      throw new PublicApplicationError("Account not found.", "account_not_found", 404);
  }
}
