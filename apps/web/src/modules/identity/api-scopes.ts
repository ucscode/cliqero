import { z } from "zod";
import type { Capability } from "./capabilities";

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
  "reviews:moderate",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];
export const apiScopeSchema = z.enum(API_SCOPES);

/**
 * Scopes used by privileged operator routes. Customer scopes deliberately do
 * not appear here: they constrain ordinary account actions and are not an
 * account-capability delegation mechanism.
 */
export const OPERATOR_SCOPE_CAPABILITIES: Partial<Record<ApiScope, readonly Capability[]>> = {
  "hierarchy:admin": ["hierarchy.manage"],
  "api_keys:manage": ["api_keys.manage"],
  "catalogue:manage": ["catalogue.manage"],
  "withdrawals:manage": ["withdrawals.manage"],
  "treasury:read": ["treasury.manage"],
  "treasury:manage": ["treasury.manage"],
  // This legacy scope covers operator account inspection plus finance
  // inspection and mutations. Every authority is required for delegation;
  // downstream routes still apply their narrower capability checks.
  "operations:manage": ["accounts.read", "finance.read", "finance.manage"],
  "blog:read": ["content.manage"],
  "blog:write": ["content.manage"],
  "blog:publish": ["content.manage"],
  "blog:manage": ["content.manage"],
  "reviews:moderate": ["reviews.moderate"],
};

export const API_SCOPE_METADATA = {
  "hierarchy:read": {
    label: "Hierarchy reads",
    description: "Read permitted referral hierarchy data.",
  },
  "hierarchy:admin": {
    label: "Hierarchy administration",
    description: "Restricts this key to hierarchy administration requests.",
  },
  "api_keys:manage": {
    label: "API-key management",
    description: "Restricts this key to API-key management requests.",
  },
  "catalogue:read": {
    label: "Catalogue reads",
    description: "Read catalogue data available to the account.",
  },
  "catalogue:manage": {
    label: "Catalogue management",
    description: "Restricts this key to catalogue management requests.",
  },
  "wallet:read": {
    label: "Wallet reads",
    description: "Read wallet data available to the account.",
  },
  "wallet:fund": {
    label: "Wallet funding",
    description: "Restricts this key to wallet funding requests.",
  },
  "checkout:create": { label: "Checkout", description: "Restricts this key to checkout creation." },
  "purchases:read": {
    label: "Purchase reads",
    description: "Read purchases available to the account.",
  },
  "referrals:read": {
    label: "Referral reads",
    description: "Read referral data available to the account.",
  },
  "referrals:manage": {
    label: "Referral management",
    description: "Restricts this key to referral management requests.",
  },
  "earnings:read": {
    label: "Earnings reads",
    description: "Read earnings available to the account.",
  },
  "withdrawals:read": {
    label: "Withdrawal reads",
    description: "Read withdrawals available to the account.",
  },
  "withdrawals:create": {
    label: "Withdrawal requests",
    description: "Restricts this key to creating withdrawal requests.",
  },
  "withdrawals:manage": {
    label: "Withdrawal management",
    description: "Restricts this key to withdrawal administration requests.",
  },
  "treasury:read": {
    label: "Treasury reads",
    description: "Restricts this key to treasury inspection requests.",
  },
  "treasury:manage": {
    label: "Treasury management",
    description: "Restricts this key to treasury mutation requests.",
  },
  "operations:manage": {
    label: "Financial operations",
    description: "Restricts this key to recognized financial operator requests.",
  },
  "blog:read": {
    label: "Content reads",
    description: "Restricts this key to runtime content reads.",
  },
  "blog:write": {
    label: "Content editing",
    description: "Restricts this key to runtime content editing.",
  },
  "blog:publish": {
    label: "Content publishing",
    description: "Restricts this key to runtime content publishing.",
  },
  "blog:manage": {
    label: "Content administration",
    description: "Restricts this key to runtime content administration.",
  },
  "reviews:moderate": {
    label: "Review moderation",
    description: "Restricts this key to review moderation requests.",
  },
} satisfies Record<ApiScope, { label: string; description: string }>;

export function operatorCapabilitiesForScope(scope: ApiScope): readonly Capability[] {
  return OPERATOR_SCOPE_CAPABILITIES[scope] ?? [];
}

export function assertApiScopes(scopes: readonly string[]): readonly ApiScope[] {
  const parsed = z.array(apiScopeSchema).max(20).safeParse(scopes);
  if (!parsed.success) throw new Error("Unknown API key scope");
  return parsed.data;
}
