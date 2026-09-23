import type { Account } from "./account";

export type AuthIdentityResolution =
  | { state: "missing"; account: null }
  | { state: "incomplete"; account: null }
  | { state: "complete"; account: Account };

export type AuthAccountLinkState = AuthIdentityResolution["state"];

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
  resolveAuthIdentity(authUserId: string): Promise<AuthIdentityResolution>;
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
