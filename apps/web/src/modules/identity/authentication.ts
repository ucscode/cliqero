import type { Account } from "./account";

/** Application-facing identity contract; SQL and Better Auth wiring stay outside the domain module. */
export interface AuthenticationService {
  register(input: {
    email: string;
    username: string;
    password: string;
    country?: string | null;
  }): Promise<Account>;
  login(email: string, password: string): Promise<{ account: Account; token: string }>;
  authenticate(token: string): Promise<Account | null>;
  authenticateRequest(request: Request): Promise<Account | null>;
  accountForAuthUser(authUserId: string): Promise<Account | null>;
  principal(request: Request): Promise<{ authUserId: string; account: Account | null } | null>;
  authUserEmail(authUserId: string): Promise<string | null>;
  resetPassword(authUserId: string, newPassword: string): Promise<void>;
  hasPasswordCredential(authUserId: string): Promise<boolean>;
  completeOnboarding(
    authUserId: string,
    input: { username: string; country?: string | null; password?: string },
    headers?: Headers,
  ): Promise<Account>;
}

/** Extracts a bearer token without applying authentication policy. */
export function bearerCredential(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;
  const token = authorization.slice(7).trim();
  return token || null;
}
