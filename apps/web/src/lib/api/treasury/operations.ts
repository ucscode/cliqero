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
  actor: {
    id: string | null;
    username: string | null;
    email: string | null;
    kind: "customer" | "operator" | "system" | null;
  } | null;
  correlationId: string | null;
  createdAt: string;
};

export type OperatorTreasuryPage = {
  items: OperatorTreasuryEntry[];
  nextCursor: string | null;
};
