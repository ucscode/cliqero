import { apiFetch } from "./api-client";

export type CanonicalApplicationSession = {
  authenticated: true;
  account: { id: string; username: string };
};

export function isCanonicalApplicationSession(
  value: unknown,
): value is CanonicalApplicationSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    authenticated?: unknown;
    account?: { id?: unknown; username?: unknown };
  };
  return (
    candidate.authenticated === true &&
    typeof candidate.account?.id === "string" &&
    candidate.account.id.length > 0 &&
    typeof candidate.account?.username === "string" &&
    candidate.account.username.length > 0
  );
}

export async function fetchCanonicalApplicationSession(): Promise<CanonicalApplicationSession> {
  const value = await apiFetch<unknown>("/api/me/session");
  if (!isCanonicalApplicationSession(value))
    throw new Error("Invalid canonical application session response");
  return value;
}
