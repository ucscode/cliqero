import type { ApiKeyService } from "@/infrastructure/postgres/api-keys";
import type { SqlExecutor } from "@/infrastructure/postgres/database";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import { PublicApplicationError } from "@/kernel/errors";
import { hasCapability, type Capability } from "@/modules/identity/capabilities";
import {
  API_SCOPES,
  assertApiScopes,
  operatorCapabilitiesForScope,
  type ApiScope,
} from "@/modules/identity/api-scopes";

export type OperatorApiKeyInput = {
  name: string;
  scopes: string[];
  expiresAt?: Date | null;
};

function forbidden(message: string, code = "forbidden") {
  return new PublicApplicationError(message, code, 403);
}

export class OperatorApiKeyService {
  constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly sql: SqlExecutor,
    private readonly uow: UnitOfWork,
  ) {}

  async list(actorId: string, targetId: string) {
    const actorCapabilities = await this.capabilities(actorId);
    if (!hasCapability(actorCapabilities, "api_keys.manage"))
      throw forbidden("You are not allowed to administer API keys.");
    await this.ensureAccount(targetId);
    const targetCapabilities = await this.capabilities(targetId);
    const root = hasCapability(actorCapabilities, "system.root");
    const manageableScopes = API_SCOPES.filter((scope) => {
      const required = operatorCapabilitiesForScope(scope);
      return (
        !required.length ||
        (required.every((capability) => hasCapability(targetCapabilities, capability)) &&
          (root || required.every((capability) => hasCapability(actorCapabilities, capability))))
      );
    });
    return { items: await this.apiKeys.list(targetId), manageableScopes };
  }

  async create(actorId: string, targetId: string, input: OperatorApiKeyInput) {
    return this.uow.transaction(async () => {
      const actorCapabilities = await this.capabilities(actorId);
      if (!hasCapability(actorCapabilities, "api_keys.manage"))
        throw forbidden("You are not allowed to administer API keys.");
      const targetCapabilities = await this.capabilities(targetId);
      await this.ensureAccount(targetId);
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
      await this.audit(actorId, "api_key.created", created.id, {
        target_account_id: targetId,
        name: created.name,
        key_prefix: created.keyPrefix,
        scopes: created.scopes,
        expires_at: created.expiresAt?.toISOString() ?? null,
      });
      return created;
    });
  }

  async revoke(actorId: string, targetId: string, keyId: string) {
    return this.uow.transaction(async () => {
      const actorCapabilities = await this.capabilities(actorId);
      if (!hasCapability(actorCapabilities, "api_keys.manage"))
        throw forbidden("You are not allowed to administer API keys.");
      await this.ensureAccount(targetId);
      const key = await this.apiKeys.find(keyId, targetId);
      if (!key) throw new PublicApplicationError("API key not found.", "not_found", 404);
      if (key.revokedAt) return { changed: false, key };
      const changed = await this.apiKeys.revoke(keyId, targetId);
      if (changed)
        await this.audit(actorId, "api_key.revoked", keyId, {
          target_account_id: targetId,
          name: key.name,
          key_prefix: key.keyPrefix,
          scopes: key.scopes,
        });
      return { changed, key };
    });
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

  private async capabilities(accountId: string) {
    const result = await this.sql.query<{ capability: string }>(
      `select ac.capability
         from identity_capability.account_capabilities ac
         join identity_capability.accounts a on a.id=ac.account_id
        where a.uuid=$1`,
      [accountId],
    );
    return result.rows.map((row) => row.capability as Capability);
  }

  private async ensureAccount(accountId: string) {
    const result = await this.sql.query(
      `select 1 from identity_capability.accounts where uuid=$1`,
      [accountId],
    );
    if (!result.rowCount)
      throw new PublicApplicationError("Account not found.", "account_not_found", 404);
  }

  private async audit(
    actorId: string,
    action: "api_key.created" | "api_key.revoked",
    keyId: string,
    state: Record<string, unknown>,
  ) {
    await this.sql.query(
      `insert into kernel.audit_records(actor_id,action,subject_type,subject_id,previous_state,new_state,correlation_id)
       values((select id from identity_capability.accounts where uuid=$1),$2,'api_key',$3,$4::jsonb,$5::jsonb,gen_random_uuid())`,
      [
        actorId,
        action,
        keyId,
        action === "api_key.revoked" ? JSON.stringify({ ...state, active: true }) : null,
        JSON.stringify({ ...state, active: action === "api_key.created" }),
      ],
    );
  }
}
