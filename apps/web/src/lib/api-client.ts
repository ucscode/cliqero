export type ListingMedia = {
  id: string;
  url: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  position: number;
  alt_text: string | null;
};

export type Listing = {
  id: string;
  title: string;
  description: string;
  price: { minor_amount: string; currency: string };
  metadata: Record<string, unknown>;
  state?: "draft" | "published" | "archived";
  media: ListingMedia[];
};

export type ListingPage = { items: Listing[]; next_cursor: string | null };

export type WalletSummary = {
  currency: "USD";
  available_minor: string;
  pending_minor: string;
};

export type WalletTransaction = {
  id: string;
  type: "funding_credit" | "purchase_debit";
  source_id: string;
  state: "pending" | "available" | "complete";
  amount_minor: string;
  currency: string;
  created_at: string;
};

export type FundingStatus = {
  id: string;
  state:
    | "initialization_pending"
    | "initializing"
    | "awaiting_payment"
    | "verification_pending"
    | "confirmed"
    | "failed"
    | "blocked"
    | "reconciliation_pending";
  provider: string;
  amount_minor: string;
  currency: string;
  collection_amount_minor: string;
  collection_currency: string;
  authorization_url: string | null;
  confirmed_at: string | null;
};

export type Purchase = {
  id: string;
  checkout_id: string | null;
  listing_id: string;
  title: string;
  amount_minor: string;
  currency: string;
  state: "pending" | "paid" | "completed" | "failed" | "refunded";
  created_at: string;
  entitlement_state: "active" | "revoked" | "expired" | null;
  entitlement_expires_at: string | null;
  access_available: boolean;
};

export type PurchasePage = { items: Purchase[]; nextCursor: string | null };

export type CheckoutStatus = {
  id: string;
  purchase_id: string;
  state: "awaiting_funds" | "paid" | "failed";
  amount_minor: string;
  currency: string;
};

export type ReferralLink = {
  id: string;
  listing_id: string;
  listing_title: string | null;
  state: "active" | "revoked";
  created_at?: string;
  url: string;
};

export type ReferralLinkPage = {
  items: ReferralLink[];
};

export type ReferralPage = {
  accounts: string[];
  nextCursor: string | null;
};

export type Upline = {
  accountId: string;
  depth: number;
};

export type UplinePage = {
  uplines: Upline[];
};

export type HierarchyNode = {
  id: string;
  handle: string;
  displayName: string | null;
  depth: number;
  directChildCount: number;
  hasChildren: boolean;
  hasMoreChildren: boolean;
  nextChildCursor: string | null;
};

export type HierarchyTree = {
  root: string;
  windowDepth: number;
  childLimit: number;
  parent: {
    id: string;
    handle: string;
    displayName: string | null;
    canNavigate: boolean;
  } | null;
  nodes: HierarchyNode[];
  edges: { parent: string; child: string }[];
};

export type HierarchyChildren = {
  parentId: string;
  items: HierarchyNode[];
  nextCursor: string | null;
};

export type EarningsBalance = {
  currency: string;
  state: string;
  amount_minor: string;
};

export type EarningsSummary = {
  balances: EarningsBalance[];
};

export type EarningsEntry = {
  id: string;
  purchase_id: string | null;
  entry_type: string;
  direction: "credit" | "debit";
  amount_minor: string;
  currency: string;
  recipient_role: string | null;
  balance_state: string;
  created_at: string;
};

export type EarningsEntryPage = {
  items: EarningsEntry[];
  nextCursor: string | null;
};

export type WithdrawalState =
  "requested" | "approved" | "rejected" | "cancelled" | "completed" | "failed";

export type Withdrawal = {
  id: string;
  amount_minor: string;
  currency: string;
  destination_type: "bank" | "manual";
  destination_summary: string;
  state: WithdrawalState;
  reason: string | null;
  created_at: string;
  updated_at: string;
};

export type WithdrawalPolicy = {
  enabled: boolean;
  minimum_amount_minor: string;
  maximum_amount_minor: string | null;
  currency: string;
};

export type WithdrawalReservation = {
  currency: string;
  reserved_minor: string;
  completed_minor: string;
};

export type WithdrawalPage = {
  withdrawals: Withdrawal[];
  available_minor: string;
  reservations: WithdrawalReservation[];
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers: { accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let body: { error?: string; code?: string } = {};
    try {
      body = (await response.json()) as typeof body;
    } catch {
      // Keep the API error useful even when a protocol route returns no JSON.
    }
    throw new ApiClientError(body.error ?? "Something went wrong", response.status, body.code);
  }
  return (await response.json()) as T;
}

export function safeContinuation(value: string | null | undefined, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return fallback;
  return value;
}

export function formatMinorUsd(minor: string | bigint): string {
  const value = typeof minor === "bigint" ? minor : BigInt(minor);
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const dollars = absolute / 100n;
  const cents = (absolute % 100n).toString().padStart(2, "0");
  return `${sign}$${dollars.toLocaleString("en-US")}.${cents}`;
}

export function parseUsdMinor(value: string): string {
  const normalized = value.trim().replace(/^\$/, "");
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized))
    throw new Error("Enter a USD amount with no more than two decimal places.");
  const [dollars, cents = ""] = normalized.split(".");
  const minor = BigInt(dollars) * 100n + BigInt(cents.padEnd(2, "0") || "0");
  if (minor <= 0n) throw new Error("Enter an amount greater than zero.");
  return minor.toString();
}
