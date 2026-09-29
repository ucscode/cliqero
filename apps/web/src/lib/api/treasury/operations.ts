export type OperatorTreasurySummary = {
  balanceMinor: string;
  creditsMinor: string;
  debitsMinor: string;
  currency: "USD";
};

export type OperatorTreasuryEntry = {
  id: string;
  direction: "credit" | "debit";
  amountMinor: string;
  title: string;
  note: string | null;
  source: { kind: string; id: string } | null;
  actor: { id: string; username: string; email: string | null } | null;
  createdAt: string;
};

export type OperatorTreasuryPage = {
  items: OperatorTreasuryEntry[];
  nextCursor: string | null;
};
