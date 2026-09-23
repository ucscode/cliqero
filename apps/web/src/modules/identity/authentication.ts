import type { Account } from "./account";
import type { AuthAccountLinkState } from "./persistence";

export type AuthenticationPrincipal = {
  authUserId: string;
  account: Account | null;
  authLinkState: AuthAccountLinkState;
};

/** Application-facing identity contract; SQL and Better Auth wiring stay outside the domain module. */
export interface AuthenticationService {
  register(input: {
    email: string;
    username: string;
    password: string;
    country?: string | null;
    accountReferralSource?: string;
  }): Promise<Account>;
  login(email: string, password: string): Promise<{ account: Account; token: string }>;
  authenticate(token: string): Promise<Account | null>;
  authenticateRequest(request: Request): Promise<Account | null>;
  accountForAuthUser(authUserId: string): Promise<Account | null>;
  principal(request: Request): Promise<AuthenticationPrincipal | null>;
  authUserEmail(authUserId: string): Promise<string | null>;
  resetPassword(authUserId: string, newPassword: string): Promise<void>;
  hasPasswordCredential(authUserId: string): Promise<boolean>;
  completeOnboarding(
    authUserId: string,
    input: { username: string; country?: string | null; password?: string },
    headers?: Headers,
    accountReferralSource?: string,
  ): Promise<Account>;
}

/** Extracts a bearer token without applying authentication policy. */
export function bearerCredential(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;
  const token = authorization.slice(7).trim();
  return token || null;
}
