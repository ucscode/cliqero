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
import type { ApiKeyManagementRepository } from "@/modules/identity/api/keys";
import type { ApiKeyRecord } from "@/modules/identity/api/keys";
import { CrudService } from "@/kernel/crud";

export type OperatorApiKeyInput = {
  name?: string;
  scopes?: string[];
  expiresAt?: Date | null;
  status?: "active" | "revoked";
};
type OperatorApiKeyCreateInput = Required<Pick<OperatorApiKeyInput, "name" | "scopes">> &
  Pick<OperatorApiKeyInput, "expiresAt" | "status"> & { accountId?: string };

function forbidden(message: string, code = "forbidden") {
  return new PublicApplicationError(message, code, 403);
}

export class OperatorApiKeyService extends CrudService<
  [actorId: string, targetId: string, input: OperatorApiKeyCreateInput],
  [actorId: string, keyId: string],
  [actorId: string, keyId: string, input: OperatorApiKeyInput],
  [actorId: string, targetId: string, keyId: string],
  Promise<Awaited<ReturnType<ApiKeyManagementRepository["create"]>>>,
  Promise<ApiKeyRecord>,
  Promise<ApiKeyRecord>,
  Promise<void>
> {
  constructor(
    private readonly apiKeys: ApiKeyManagementRepository,
    private readonly accounts: AccountReader,
    private readonly operators: OperatorAuthorizationService,
    private readonly audit: AuditRecorder,
    private readonly uow: UnitOfWork,
  ) {
    super();
  }

  async listForSession(
    actorId: string,
    input: {
      accountId?: string;
      search?: string;
      state?: "active" | "expired" | "revoked" | "all";
      sort?: "created" | "name" | "expires";
      direction?: "asc" | "desc";
      limit: number;
      cursor?: string;
    },
  ) {
    const actorCapabilities = await this.operators.capabilities(actorId);
    const operator = hasCapability(actorCapabilities, "api_keys.manage");
    if (!operator) {
      this.requireSelfManagement(actorCapabilities);
      if (input.accountId && input.accountId !== actorId) return this.keyNotFound();
    }
    if (input.accountId && operator) await this.ensureAccount(input.accountId);

    const visible: Array<
      Awaited<ReturnType<ApiKeyManagementRepository["listPage"]>>["items"][number]
    > = [];
    const capabilitiesByAccount = new Map<string, readonly string[]>();
    let cursor = input.cursor;
    let nextCursor: string | null = null;
    const batchSize = Math.min(100, Math.max(input.limit, 50));
    while (visible.length <= input.limit) {
      const page = await this.apiKeys.listPage({
        accountId: operator ? input.accountId : actorId,
        search: input.search,
        state: input.state,
        sort: input.sort,
        direction: input.direction,
        limit: batchSize,
        cursor,
        authorizationScope: actorId,
      });
      for (const key of page.items) {
        let targetCapabilities = capabilitiesByAccount.get(key.accountId);
        if (!targetCapabilities) {
          targetCapabilities = operator
            ? await this.operators.capabilities(key.accountId)
            : actorCapabilities;
          capabilitiesByAccount.set(key.accountId, targetCapabilities);
        }
        try {
          this.authorizeExistingScopes(actorCapabilities, targetCapabilities, key.scopes);
          visible.push(key);
          if (visible.length > input.limit) break;
        } catch (error) {
          if (!(error instanceof PublicApplicationError) || error.status !== 403) throw error;
        }
      }
      if (visible.length > input.limit) {
        nextCursor = visible[input.limit - 1].pageCursor;
        visible.length = input.limit;
        break;
      }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    let manageableScopes: ApiScope[] = [];
    if (input.accountId) {
      const targetCapabilities = operator
        ? (capabilitiesByAccount.get(input.accountId) ??
          (await this.operators.capabilities(input.accountId)))
        : actorCapabilities;
      manageableScopes = this.manageableScopes(actorCapabilities, targetCapabilities);
    } else if (!operator) {
      manageableScopes = this.manageableScopes(actorCapabilities, actorCapabilities);
    }
    return {
      items: visible,
      manageableScopes,
      nextCursor,
    };
  }

  async getForSession(actorId: string, keyId: string) {
    const actorCapabilities = await this.operators.capabilities(actorId);
    if (hasCapability(actorCapabilities, "api_keys.manage")) return this.get(actorId, keyId);
    this.requireSelfManagement(actorCapabilities);
    const key = await this.apiKeys.find(keyId, actorId);
    if (!key) return this.keyNotFound();
    this.authorizeExistingScopes(actorCapabilities, actorCapabilities, key.scopes);
    return key;
  }

  async revealForSession(actorId: string, keyId: string) {
    const key = await this.getForSession(actorId, keyId);
    const secret = await this.apiKeys.reveal(key.id);
    return { secret, legacy: secret === null };
  }

  async rotateForSession(actorId: string, keyId: string) {
    const key = await this.getForSession(actorId, keyId);
    const replacement = await this.apiKeys.reassign({
      id: key.id,
      accountId: key.accountId,
      name: key.name,
      scopes: this.validateScopes(key.scopes),
      expiresAt: key.expiresAt && key.expiresAt > new Date() ? key.expiresAt : null,
      status: key.revokedAt ? "revoked" : "active",
    });
    if (!replacement) return this.keyNotFound();
    const updated = await this.apiKeys.find(key.id);
    await this.audit.record({
      actorId,
      action: "api_key.rotated",
      subjectType: "api_key",
      subjectId: key.id,
      previousState: { keyPrefix: key.keyPrefix, legacySecret: true },
      newState: { keyPrefix: replacement.keyPrefix, credentialReplaced: true },
    });
    return { ...updated!, secret: replacement.secret };
  }

  async reassignForSession(
    actorId: string,
    keyId: string,
    input: Required<Pick<OperatorApiKeyInput, "name" | "scopes">> & {
      accountId: string;
      expiresAt: Date | null;
      status: "active" | "revoked";
    },
  ) {
    const actorCapabilities = await this.operators.capabilities(actorId);
    if (!actorCapabilities.includes("system.root"))
      throw forbidden("Only a system-root session can reassign API-key ownership.");
    return this.uow.transaction(async () => {
      const key = await this.apiKeys.find(keyId);
      if (!key) return this.keyNotFound();
      await this.ensureAccount(input.accountId);
      const targetCapabilities = await this.operators.capabilities(input.accountId);
      const scopes = this.validateScopes(input.scopes);
      this.authorizeScopes(actorCapabilities, targetCapabilities, scopes);
      const name = input.name.trim();
      if (!name)
        throw new PublicApplicationError("API-key name is required.", "invalid_request", 400);
      if (input.expiresAt && input.expiresAt <= new Date())
        throw new PublicApplicationError("Expiry must be in the future.", "invalid_request", 400);

      const replacement = await this.apiKeys.reassign({
        id: keyId,
        accountId: input.accountId,
        name,
        scopes,
        expiresAt: input.expiresAt,
        status: input.status,
      });
      if (!replacement)
        throw new PublicApplicationError(
          "Destination account not found.",
          "account_not_found",
          404,
        );
      const updated = await this.apiKeys.find(keyId);
      await this.audit.record({
        actorId,
        action: "api_key.reassigned",
        subjectType: "api_key",
        subjectId: keyId,
        previousState: {
          accountId: key.accountId,
          name: key.name,
          scopes: key.scopes,
          expiresAt: key.expiresAt?.toISOString() ?? null,
          status: key.revokedAt ? "revoked" : "active",
          credentialReplaced: true,
        },
        newState: {
          accountId: input.accountId,
          name,
          scopes,
          expiresAt: input.expiresAt?.toISOString() ?? null,
          status: input.status,
          credentialReplaced: true,
        },
      });
      return { ...updated!, secret: replacement.secret };
    });
  }

  async deleteForSession(actorId: string, keyId: string) {
    const actorCapabilities = await this.operators.capabilities(actorId);
    if (hasCapability(actorCapabilities, "api_keys.manage")) {
      const key = await this.get(actorId, keyId);
      return this.delete(actorId, key.accountId, key.id);
    }
    this.requireSelfManagement(actorCapabilities);
    const key = await this.apiKeys.find(keyId, actorId);
    if (!key) return this.keyNotFound();
    this.authorizeExistingScopes(actorCapabilities, actorCapabilities, key.scopes);
    return this.deleteRecord(actorId, key);
  }

  override async delete(actorId: string, targetId: string, keyId: string) {
    const actorCapabilities = await this.requireManager(actorId);
    const key = await this.apiKeys.find(keyId, targetId);
    if (!key) return this.keyNotFound();
    const targetCapabilities = await this.operators.capabilities(targetId);
    this.authorizeExistingScopes(actorCapabilities, targetCapabilities, key.scopes);
    return this.deleteRecord(actorId, key);
  }

  private async deleteRecord(
    actorId: string,
    key: NonNullable<Awaited<ReturnType<ApiKeyManagementRepository["find"]>>>,
  ) {
    return this.uow.transaction(async () => {
      const current = await this.apiKeys.find(key.id, key.accountId);
      if (!current) return this.keyNotFound();
      await this.audit.record({
        actorId,
        action: "api_key.deleted",
        subjectType: "api_key",
        subjectId: key.id,
        previousState: {
          accountId: current.accountId,
          name: current.name,
          scopes: current.scopes,
          expiresAt: current.expiresAt?.toISOString() ?? null,
          status: current.revokedAt ? "revoked" : "active",
        },
        newState: { deleted: true },
      });
      if (!(await this.apiKeys.delete(current.id, current.accountId)))
        throw new PublicApplicationError("API key not found.", "not_found", 404);
    });
  }

  async createForSession(
    actorId: string,
    input: Required<Pick<OperatorApiKeyInput, "name" | "scopes">> &
      Pick<OperatorApiKeyInput, "expiresAt" | "status"> & { accountId?: string },
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

  override async get(actorId: string, keyId: string) {
    const actorCapabilities = await this.requireManager(actorId);
    const key = await this.apiKeys.find(keyId);
    if (!key) throw new PublicApplicationError("API key not found.", "not_found", 404);
    const targetCapabilities = await this.operators.capabilities(key.accountId);
    this.authorizeExistingScopes(actorCapabilities, targetCapabilities, key.scopes);
    return key;
  }

  override async update(actorId: string, keyId: string, input: OperatorApiKeyInput) {
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
      const authorizedKey = await loadKey();
      const key = await this.apiKeys.findForUpdate(keyId, authorizedKey.accountId);
      if (!key) return this.keyNotFound();
      const actorCapabilities =
        authorizedActorCapabilities ?? (await this.operators.capabilities(actorId));
      const targetCapabilities = await this.operators.capabilities(key.accountId);
      const scopes =
        input.scopes === undefined
          ? this.validateScopes(key.scopes)
          : this.validateScopes(input.scopes);
      if (input.scopes === undefined)
        this.authorizeExistingScopes(actorCapabilities, targetCapabilities, scopes);
      else this.authorizeScopes(actorCapabilities, targetCapabilities, scopes);
      const name = input.name === undefined ? key.name : input.name.trim();
      if (!name)
        throw new PublicApplicationError("API-key name is required.", "invalid_request", 400);
      const expiresAt = input.expiresAt === undefined ? key.expiresAt : input.expiresAt;
      if (expiresAt && expiresAt <= new Date())
        throw new PublicApplicationError("Expiry must be in the future.", "invalid_request", 400);
      if (input.status === "active" && key.revokedAt && !actorCapabilities.includes("system.root"))
        throw forbidden("Only a system-root administrator can reactivate a revoked API key.");
      const status = input.status ?? (key.revokedAt ? "revoked" : "active");
      const sameScopes =
        scopes.length === key.scopes.length &&
        scopes.every((scope, index) => scope === key.scopes[index]);
      const sameExpiry = expiresAt?.getTime() === key.expiresAt?.getTime();
      const currentStatus = key.revokedAt ? "revoked" : "active";
      if (name === key.name && sameScopes && sameExpiry && status === currentStatus) return key;
      if (!(await this.apiKeys.update(keyId, { name, scopes, expiresAt, status })))
        throw new PublicApplicationError("API key not found.", "not_found", 404);
      const updated = await this.apiKeys.find(keyId);
      await this.audit.record({
        actorId,
        action:
          status !== (key.revokedAt ? "revoked" : "active")
            ? status === "revoked"
              ? "api_key.revoked"
              : "api_key.reactivated"
            : "api_key.updated",
        subjectType: "api_key",
        subjectId: keyId,
        previousState: {
          name: key.name,
          scopes: key.scopes,
          expiresAt: key.expiresAt?.toISOString() ?? null,
          status: key.revokedAt ? "revoked" : "active",
        },
        newState: {
          accountId: key.accountId,
          name,
          scopes,
          expiresAt: expiresAt?.toISOString() ?? null,
          status,
        },
      });
      return updated!;
    });
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

  override async create(actorId: string, targetId: string, input: OperatorApiKeyCreateInput) {
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
      Pick<OperatorApiKeyInput, "expiresAt" | "status">,
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
        status: input.status ?? "active",
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
          status: input.status ?? "active",
        },
      });
      return created;
    });
  }

  /** Permanently remove selected keys, checking session authority for every row. */
  async bulkDeleteForSession(actorId: string, keyIds: readonly string[]) {
    const outcome: { succeeded: string[]; failed: Array<{ id: string; message: string }> } = {
      succeeded: [],
      failed: [],
    };
    for (const keyId of new Set(keyIds)) {
      try {
        await this.deleteForSession(actorId, keyId);
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

  private authorizeExistingScopes(
    actorCapabilities: readonly string[],
    targetCapabilities: readonly string[],
    rawScopes: readonly string[],
  ) {
    const scopes = this.validateScopes(rawScopes);
    if (hasCapability(actorCapabilities, "system.root")) return scopes;
    this.authorizeScopes(actorCapabilities, targetCapabilities, scopes);
    return scopes;
  }

  private async ensureAccount(accountId: string) {
    if (!(await this.accounts.exists(accountId)))
      throw new PublicApplicationError("Account not found.", "account_not_found", 404);
  }
}
