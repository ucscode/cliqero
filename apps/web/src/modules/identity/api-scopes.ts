import { z } from "zod";

export const API_SCOPES = [
  "hierarchy:read",
  "hierarchy:admin",
  "api_keys:manage",
  "catalogue:read",
  "catalogue:manage",
  "wallet:read",
  "wallet:fund",
  "checkout:create",
  "purchases:read",
  "referrals:read",
  "referrals:manage",
  "earnings:read",
  "withdrawals:read",
  "withdrawals:create",
  "withdrawals:manage",
  "treasury:read",
  "treasury:manage",
  "operations:manage",
  "blog:read",
  "blog:write",
  "blog:publish",
  "blog:manage",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];
export const apiScopeSchema = z.enum(API_SCOPES);
export function assertApiScopes(scopes: readonly string[]): readonly ApiScope[] {
  const parsed = z.array(apiScopeSchema).max(20).safeParse(scopes);
  if (!parsed.success) throw new Error("Unknown API key scope");
  return parsed.data;
}
