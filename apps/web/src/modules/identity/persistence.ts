import type { Account } from "./account";

export class DuplicateUsernameError extends Error {
  constructor() {
    super("That username is already taken.");
    this.name = "DuplicateUsernameError";
  }
}

export interface IdentityPersistence {
  removeUnlinkedAuthUser(email: string): Promise<void>;
  createAccount(account: Account): Promise<void>;
  linkCompletedAuthAccount(authUserId: string, accountId: string): Promise<boolean>;
  removeAuthUser(authUserId: string): Promise<void>;
  accountForAuthUser(authUserId: string): Promise<Account | null>;
  authUserEmail(authUserId: string): Promise<string | null>;
}

export interface ProfilePersistence {
  profileForAccount(accountId: string): Promise<{
    email: string | null;
    username: string;
    displayName: string | null;
    country: string | null;
  } | null>;
  accountForProfileUpdate(accountId: string): Promise<{
    username: string;
    country: string | null;
  } | null>;
  updateProfile(account: Account): Promise<void>;
}
