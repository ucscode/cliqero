import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: typeof window === "undefined" ? undefined : window.location.origin,
});

/**
 * Better Auth's logical `user.name` is a provider/display-name field. Keep
 * that unavoidable protocol property at this boundary instead of treating it
 * as Cliqero's account username.
 */
export function authDisplayName(user: { name?: string | null } | null | undefined): string {
  return user?.name?.trim() || "Account";
}
