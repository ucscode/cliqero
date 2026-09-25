import type { ListingPage } from "@/lib/api-client";

export type ListingPageRequestState = {
  key: string;
  status: "loading" | "success" | "error";
  page: ListingPage | null;
  error: string | null;
};

export function listingPageRequestStarted(key: string): ListingPageRequestState {
  return { key, status: "loading", page: null, error: null };
}

export function listingPageRequestSucceeded(
  key: string,
  page: ListingPage,
): ListingPageRequestState {
  return { key, status: "success", page, error: null };
}

export function listingPageRequestFailed(key: string, error: string): ListingPageRequestState {
  return { key, status: "error", page: null, error };
}

export function listingPageRequestForKey(
  state: ListingPageRequestState,
  key: string,
): ListingPageRequestState {
  return state.key === key ? state : listingPageRequestStarted(key);
}
