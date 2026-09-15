import type { Capability } from "./capabilities";

/** Domain-facing authorization contract; persistence belongs to infrastructure. */
export interface OperatorAuthorizationService {
  capabilities(accountId: string): Promise<readonly Capability[]>;
  hasCapability(accountId: string, capability: Capability | string): Promise<boolean>;
  requireCapability(accountId: string, capability: Capability): Promise<void>;
}
