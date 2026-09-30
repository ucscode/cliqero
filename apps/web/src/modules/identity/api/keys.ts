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
  }): Promise<{
    id: string;
    secret: string;
    name: string;
    scopes: string[];
    keyPrefix: string;
    createdAt: Date;
    expiresAt: Date | null;
  }>;
  list(
    accountId?: string,
    order?: { sort?: "created" | "name" | "expires"; direction?: "asc" | "desc" },
    filters?: { search?: string; state?: "active" | "expired" | "deleted" | "all" },
  ): Promise<readonly ApiKeyRecord[]>;
  find(id: string, accountId?: string): Promise<ApiKeyRecord | null>;
  revoke(id: string, accountId?: string): Promise<boolean>;
  update(
    id: string,
    input: { name: string; scopes: string[]; expiresAt: Date | null },
  ): Promise<boolean>;
}
