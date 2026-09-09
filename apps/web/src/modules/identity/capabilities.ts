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
  return target === "system.root"
    ? hasCapability(actorCapabilities, "system.root")
    : hasCapability(actorCapabilities, "capabilities.manage");
}
