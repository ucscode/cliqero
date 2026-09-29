export type OperatorAccountSummary = {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  country: string | null;
  createdAt: string;
  directReferralCount: number;
};

export type OperatorAccountDetail = OperatorAccountSummary & {
  deletedAt: string | null;
  parent: { id: string; username: string; displayName: string | null } | null;
  purchaseCount: number;
  latestParentReassignment: {
    actorId: string | null;
    previousParentId: string | null;
    parentId: string | null;
    occurredAt: string;
  } | null;
};
