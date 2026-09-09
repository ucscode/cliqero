import type { SqlExecutor } from "@/infrastructure/postgres/database";
import { Account } from "./account";
import type { ApiKeyService } from "@/infrastructure/postgres/api-keys";
import { AuthenticationService } from "./authentication";
import type { Capability } from "./capabilities";

export type ApiPrincipalKind = "user_session" | "api_key";
export interface ApiPrincipal {
  accountId: string;
  account: Account;
  kind: ApiPrincipalKind;
  capabilities: readonly Capability[];
  scopes: ReadonlySet<string>;
}
export class ApiPrincipalResolver {
  constructor(
    private readonly authentication: AuthenticationService,
    private readonly apiKeys: ApiKeyService,
    private readonly sql: SqlExecutor,
  ) {}
  async resolve(request: Request): Promise<ApiPrincipal | null> {
    const authorization = request.headers.get("authorization");
    let account: Account | null = null;
    let kind: ApiPrincipalKind = "user_session";
    let scopes: readonly string[] = [];
    if (authorization) {
      if (!/^Bearer\s+/i.test(authorization)) return null;
      const token = authorization.replace(/^Bearer\s+/i, "").trim();
      if (token.startsWith("cliq_live_")) {
        const key = await this.apiKeys.authenticate(token);
        if (!key) return null;
        account = await this.authenticationAccount(key.accountId);
        if (!account) return null;
        kind = "api_key";
        scopes = key.scopes;
      } else account = await this.authentication.authenticate(token);
    } else account = await this.authentication.authenticateRequest(request);
    if (!account) return null;
    const rows = await this.sql.query<{ capability: string }>(
      `select capability from identity_capability.account_capabilities where account_id=(select id from identity_capability.accounts where uuid=$1)`,
      [account.id],
    );
    return {
      accountId: account.id,
      account,
      kind,
      capabilities: rows.rows.map((r) => r.capability as Capability),
      scopes: new Set(scopes),
    };
  }
  private async authenticationAccount(id: string) {
    const row = (
      await this.sql.query<{
        id: string;
        username: string;
        country: string | null;
      }>(
        `select uuid as id,username,metadata->>'country' country from identity_capability.accounts where uuid=$1`,
        [id],
      )
    ).rows[0];
    return row ? new Account(row.id, row.username, row.country) : null;
  }
}
