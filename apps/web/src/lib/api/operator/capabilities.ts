import type { OperatorAccountSummary } from "./accounts";

export type OperatorAccountPage = {
  items: OperatorAccountSummary[];
  nextCursor: string | null;
};

export type CapabilityAssignment = {
  capability: string;
  grantedAt: string;
};

export type CapabilityAdministrationView = {
  accountId: string;
  assignments: CapabilityAssignment[];
  manageableCapabilities: string[];
  isSelf: boolean;
};
