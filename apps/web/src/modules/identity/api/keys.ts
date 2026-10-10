import { CrudRepository } from "@/kernel/crud";

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

export abstract class ApiKeyManagementRepository extends CrudRepository<
  [
    input: {
      accountId: string;
      name: string;
      scopes: string[];
      createdBy: string;
      expiresAt?: Date | null;
      status?: "active" | "revoked";
    },
  ],
  [id: string],
  [
    id: string,
    input: {
      name: string;
      scopes: string[];
      expiresAt: Date | null;
      status?: "active" | "revoked";
    },
  ],
  [id: string, accountId?: string],
  Promise<{
    id: string;
    secret: string;
    name: string;
    scopes: string[];
    keyPrefix: string;
    createdAt: Date;
    expiresAt: Date | null;
    revokedAt: Date | null;
  }>,
  Promise<ApiKeyRecord | null>,
  Promise<boolean>,
  Promise<boolean>
> {
  abstract listPage(input: {
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
  abstract find(id: string, accountId?: string): Promise<ApiKeyRecord | null>;
  abstract findForUpdate(id: string, accountId?: string): Promise<ApiKeyRecord | null>;
  abstract reassign(input: {
    id: string;
    accountId: string;
    name: string;
    scopes: string[];
    expiresAt: Date | null;
    status: "active" | "revoked";
  }): Promise<{ secret: string; keyPrefix: string } | null>;
  abstract reveal(id: string): Promise<string | null>;
}
