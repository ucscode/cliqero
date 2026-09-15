import type { Auth } from "better-auth";

export type BetterAuthInstance = Auth<any>;

/** Narrow identity-module view of the external authentication boundary. */
export interface BetterAuthBoundary {
  readonly auth: BetterAuthInstance;
  close(): Promise<void>;
  resetPassword(authUserId: string, newPassword: string): Promise<void>;
  hasPasswordCredential(authUserId: string): Promise<boolean>;
  setPassword(authUserId: string, newPassword: string, headers: Headers): Promise<string>;
  removePasswordCredential(authUserId: string, credentialId: string): Promise<void>;
}
