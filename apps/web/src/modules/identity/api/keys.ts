export interface ApiKeyRecord {
  id: string;
  accountId: string;
  accountUsername?: string;
  accountEmail?: string | null;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface ApiKeyManagementService {
  create(input: {
    accountId: string;
    name: string;
    scopes: string[];
    createdBy: string;
    expiresAt?: Date | null;
    status?: "active" | "revoked";
  }): Promise<{
    id: string;
    secret: string;
    name: string;
    scopes: string[];
    keyPrefix: string;
    createdAt: Date;
    expiresAt: Date | null;
    revokedAt: Date | null;
  }>;
  listPage(input: {
    accountId?: string;
    search?: string;
    state?: "active" | "expired" | "revoked" | "all";
    sort?: "created" | "name" | "expires";
    direction?: "asc" | "desc";
    limit: number;
    cursor?: string;
    authorizationScope: string;
  }): Promise<{
    items: readonly (ApiKeyRecord & { pageCursor: string })[];
    nextCursor: string | null;
  }>;
  find(id: string, accountId?: string): Promise<ApiKeyRecord | null>;
  revoke(id: string, accountId?: string): Promise<boolean>;
  update(
    id: string,
    input: {
      name: string;
      scopes: string[];
      expiresAt: Date | null;
      status?: "active" | "revoked";
    },
  ): Promise<boolean>;
  reassign(input: {
    id: string;
    accountId: string;
    name: string;
    scopes: string[];
    expiresAt: Date | null;
    status: "active" | "revoked";
  }): Promise<{ secret: string; keyPrefix: string } | null>;
  delete(id: string, accountId?: string): Promise<boolean>;
}
