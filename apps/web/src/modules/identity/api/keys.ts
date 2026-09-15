export interface ApiKeyRecord {
  id: string;
  accountId: string;
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
  list(accountId?: string): Promise<readonly ApiKeyRecord[]>;
  find(id: string, accountId?: string): Promise<ApiKeyRecord | null>;
  revoke(id: string, accountId?: string): Promise<boolean>;
}
