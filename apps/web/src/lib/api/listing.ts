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
  test_only: "development" | "test" | null;
  price: { minor_amount: string; currency: string };
  metadata: Record<string, unknown>;
  state?: "draft" | "published" | "archived";
  featured_position?: number | null;
  rating: { average: number; count: number } | null;
  media: ListingMedia[];
};

export type ListingReview = {
  id: string;
  listing_id: string;
  rating: number;
  body: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
  moderated_at: string | null;
  reviewer?: string;
  is_mine?: boolean;
};
export type ListingReviewPage = { items: ListingReview[]; next_cursor: string | null };

export type ListingPage = { items: Listing[]; next_cursor: string | null };

export type OperatorListing = Listing & {
  destination: string;
  external_key: string | null;
  managed_by?: string;
};

export type OperatorListingPage = {
  items: OperatorListing[];
  next_cursor: string | null;
};
