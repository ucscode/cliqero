export type Purchase = {
  id: string;
  checkout_id: string | null;
  listing_id: string;
  title: string;
  short_description: string;
  long_description: string;
  amount_minor: string;
  currency: string;
  state: "pending" | "paid" | "completed" | "failed" | "refunded";
  created_at: string;
  entitlement_state: "active" | "consumed" | "revoked" | "expired" | null;
  entitlement_expires_at: string | null;
  access_available: boolean;
};

export type PurchasePage = { items: Purchase[]; nextCursor: string | null };

export type CheckoutStatus = {
  id: string;
  purchase_id: string;
  state: "pending" | "paid" | "failed";
  amount_minor: string;
  currency: string;
};

export type CheckoutQuote = {
  required: { amount_minor: string; currency: string };
  available: { amount_minor: string; currency: string };
  shortfall: { amount_minor: string; currency: string };
};
