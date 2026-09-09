/** Direct account capabilities granted by Cliqero operators. */
export const CAPABILITIES = [
  "system.root",
  "catalogue.manage",
  "content.manage",
  "accounts.read",
  "hierarchy.manage",
  "finance.read",
  "finance.manage",
  "withdrawals.manage",
  "treasury.manage",
  "reviews.moderate",
  "api_keys.manage",
  "capabilities.manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_METADATA = {
  "system.root": {
    label: "Master operator authority",
    description: "Full operator authority across recognized platform capabilities.",
  },
  "catalogue.manage": {
    label: "Catalogue management",
    description: "Manage listings, publication, media and access configuration.",
  },
  "content.manage": {
    label: "Content management",
    description: "Create, edit and publish runtime blog content.",
  },
  "accounts.read": {
    label: "Account inspection",
    description: "Search and inspect account projections and identity context.",
  },
  "hierarchy.manage": {
    label: "Hierarchy management",
    description: "Inspect and administer the global referral hierarchy.",
  },
  "finance.read": {
    label: "Financial inspection",
    description: "Inspect funding, distributions, earnings and provider events.",
  },
  "finance.manage": {
    label: "Financial operations",
    description: "Reconcile providers, settle earnings and process purchase reversals.",
  },
  "withdrawals.manage": {
    label: "Withdrawal operations",
    description: "Review withdrawals and manage payout execution workflows.",
  },
  "treasury.manage": {
    label: "Treasury management",
    description: "Inspect treasury state and record approved treasury entries.",
  },
  "reviews.moderate": {
    label: "Review moderation",
    description: "Inspect and moderate submitted product reviews.",
  },
  "api_keys.manage": {
    label: "API-key administration",
    description: "Administer API keys belonging to other accounts.",
  },
  "capabilities.manage": {
    label: "Capability administration",
    description: "Delegate ordinary direct capabilities within your own authority.",
  },
} satisfies Record<Capability, { label: string; description: string }>;

/** Capabilities that currently have a corresponding operator console section. */
export const OPERATOR_SECTION_CAPABILITIES = [
  "catalogue.manage",
  "content.manage",
  "accounts.read",
  "hierarchy.manage",
  "finance.read",
  "finance.manage",
  "withdrawals.manage",
  "treasury.manage",
  "reviews.moderate",
] as const satisfies readonly Capability[];

export const CAPABILITY_SET: ReadonlySet<string> = new Set(CAPABILITIES);

export function isCapability(value: string): value is Capability {
  return CAPABILITY_SET.has(value);
}

export function hasCapability(
  capabilities: readonly string[],
  requested: Capability | string,
): boolean {
  if (!isCapability(requested)) return false;
  return capabilities.includes(requested) || capabilities.includes("system.root");
}

export function hasAnyCapability(
  capabilities: readonly string[],
  requested: readonly Capability[],
): boolean {
  return requested.some((capability) => hasCapability(capabilities, capability));
}

export function canAccessOperator(capabilities: readonly string[]): boolean {
  return hasAnyCapability(capabilities, OPERATOR_SECTION_CAPABILITIES);
}

/**
 * Capability administration deliberately treats the reserved root capability
 * as a separate trust boundary. Ordinary capability management can never
 * grant or revoke system.root.
 */
export function canManageCapability(
  actorCapabilities: readonly string[],
  target: Capability,
): boolean {
  if (target === "system.root") return hasCapability(actorCapabilities, "system.root");
  return (
    hasCapability(actorCapabilities, "system.root") ||
    (hasCapability(actorCapabilities, "capabilities.manage") &&
      hasCapability(actorCapabilities, target))
  );
}
