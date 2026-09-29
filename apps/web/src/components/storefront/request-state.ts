import type { ListingPage } from "@/lib/api-client";

export type CatalogueSortField = "date" | "price" | "title" | "rating";
export type CatalogueSortDirection = "asc" | "desc";

export function catalogueNavigationUrlState(
  current: string,
  updates: Record<string, string | null>,
) {
  const params = new URLSearchParams(current);
  for (const [key, value] of Object.entries(updates)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return params;
}

export function catalogueSortUrlState(
  current: string,
  sort: CatalogueSortField,
  direction: CatalogueSortDirection,
) {
  const params = catalogueNavigationUrlState(current, {});
  params.delete("cursor");
  params.delete("trail");
  if (sort === "date") params.delete("sort");
  else params.set("sort", sort);
  if (direction === "desc") params.delete("direction");
  else params.set("direction", direction);
  return params;
}

export function catalogueListRequestUrl(
  query: string,
  sort: CatalogueSortField,
  direction: CatalogueSortDirection,
  cursor: string,
) {
  const params = new URLSearchParams();
  if (query) params.set("search", query);
  if (sort !== "date") params.set("sort", sort);
  if (direction !== "desc") params.set("direction", direction);
  if (cursor) params.set("cursor", cursor);
  return `/api/listings?${params}`;
}

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
