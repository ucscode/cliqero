"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { apiFetch, ApiClientError, type ListingPage } from "@/lib/api-client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { EmptyState } from "../empty-state";
import { Toast } from "../toast";
import { HoneypotField } from "../honeypot-field";
import { LoadingGrid, ListingGrid } from "./grid";
import {
  catalogueListRequestUrl,
  catalogueNavigationUrlState,
  catalogueSortUrlState,
  listingPageRequestFailed,
  listingPageRequestForKey,
  listingPageRequestStarted,
  listingPageRequestSucceeded,
  type ListingPageRequestState,
  type CatalogueSortDirection,
  type CatalogueSortField,
} from "./request-state";

const sortOptions: CatalogueSortField[] = ["date", "price", "title", "rating"];
const directions: CatalogueSortDirection[] = ["asc", "desc"];

export function Storefront({ reviewsVisible }: { reviewsVisible: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const sort = sortOptions.includes(searchParams.get("sort") as CatalogueSortField)
    ? (searchParams.get("sort") as CatalogueSortField)
    : "date";
  const direction = directions.includes(searchParams.get("direction") as CatalogueSortDirection)
    ? (searchParams.get("direction") as CatalogueSortDirection)
    : "desc";
  const cursor = searchParams.get("cursor") ?? "";
  const trail = searchParams.get("trail")?.split(",").filter(Boolean) ?? [];
  const [draft, setDraft] = useState(query);
  const [draftSort, setDraftSort] = useState<CatalogueSortField>(sort);
  const [draftDirection, setDraftDirection] = useState<CatalogueSortDirection>(direction);
  const [request, setRequest] = useState<ListingPageRequestState>(() =>
    listingPageRequestStarted(""),
  );
  const [retryVersion, setRetryVersion] = useState(0);
  const requestKey = JSON.stringify([query, sort, direction, cursor]);
  useEffect(() => {
    // The address bar is the catalogue state authority after navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(query);
  }, [query]);
  useEffect(() => {
    // The address bar remains authoritative when the user navigates history.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftSort(sort);
    setDraftDirection(direction);
  }, [sort, direction]);
  useEffect(() => {
    let active = true;
    // The address bar is the catalogue state authority after navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRequest(listingPageRequestStarted(requestKey));
    void apiFetch<ListingPage>(catalogueListRequestUrl(query, sort, direction, cursor))
      .then((result) => {
        if (active) setRequest(listingPageRequestSucceeded(requestKey, result));
      })
      .catch((cause: unknown) => {
        if (active)
          setRequest(
            listingPageRequestFailed(
              requestKey,
              cause instanceof ApiClientError ? cause.message : "We couldn't load the catalogue.",
            ),
          );
      });
    return () => {
      active = false;
    };
  }, [query, sort, direction, cursor, requestKey, retryVersion]);
  const currentRequest = listingPageRequestForKey(request, requestKey);
  function navigate(next: Record<string, string | null>) {
    const params = catalogueNavigationUrlState(searchParams.toString(), next);
    router.push(`${pathname}?${params}`);
  }
  function next() {
    if (!currentRequest.page?.next_cursor) return;
    navigate({
      cursor: currentRequest.page.next_cursor,
      trail: cursor ? [...trail, cursor].join(",") : null,
    });
  }
  function previous() {
    navigate({ cursor: trail.at(-1) ?? null, trail: trail.slice(0, -1).join(",") || null });
  }
  function applySorting() {
    const params = catalogueSortUrlState(searchParams.toString(), draftSort, draftDirection);
    router.push(`${pathname}?${params}`);
  }
  return (
    <section className="grid gap-8" aria-labelledby="catalogue-heading">
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1
            id="catalogue-heading"
            className="mb-0 text-5xl font-semibold tracking-tight sm:text-6xl"
          >
            Explore useful things.
          </h1>
        </div>
        <form
          className="flex w-full max-w-md gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            navigate({ q: draft.trim() || null, cursor: null, trail: null });
          }}
        >
          <label className="sr-only" htmlFor="catalogue-search">
            Search catalogue
          </label>
          <Input
            id="catalogue-search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search listings"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
          <HoneypotField />
        </form>
      </div>
      <div className="flex justify-end">
        <div className="flex flex-wrap items-end justify-end gap-2">
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Sort by
            <Select
              value={draftSort}
              onChange={(event) => setDraftSort(event.target.value as CatalogueSortField)}
              className="w-32"
              aria-label="Sort by"
            >
              <option value="date">Date</option>
              <option value="price">Price</option>
              <option value="title">Title</option>
              <option value="rating">Rating</option>
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Direction
            <Select
              value={draftDirection}
              onChange={(event) => setDraftDirection(event.target.value as CatalogueSortDirection)}
              className="w-36"
              aria-label="Direction"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </Select>
          </label>
          <Button
            type="button"
            variant="secondary"
            aria-label="Apply sorting"
            className="focus-visible:ring-2 focus-visible:ring-emerald-600"
            onClick={applySorting}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {currentRequest.status === "loading" ? (
        <LoadingGrid />
      ) : currentRequest.status === "error" ? (
        <div className="grid justify-items-start gap-3">
          <Toast>{currentRequest.error}</Toast>
          <Button
            variant="secondary"
            onClick={() => {
              setRequest(listingPageRequestStarted(requestKey));
              setRetryVersion((version) => version + 1);
            }}
          >
            Try again
          </Button>
        </div>
      ) : currentRequest.page?.items.length ? (
        <>
          <ListingGrid listings={currentRequest.page.items} reviewsVisible={reviewsVisible} />
          <nav
            className="flex items-center justify-between border-t border-slate-200 pt-6"
            aria-label="Catalogue pages"
          >
            <Button variant="secondary" disabled={!cursor} onClick={previous}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-slate-600">Page {trail.length + (cursor ? 2 : 1)}</span>
            <Button variant="secondary" disabled={!currentRequest.page.next_cursor} onClick={next}>
              Next
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </nav>
        </>
      ) : (
        <EmptyState
          title="Nothing here yet"
          description={
            query
              ? "Try a different search term."
              : "The catalogue is being prepared. Check back soon."
          }
        />
      )}
    </section>
  );
}

export function StorefrontFallback() {
  return (
    <section className="grid gap-8" aria-busy="true" aria-labelledby="catalogue-heading">
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1
            id="catalogue-heading"
            className="mb-0 text-5xl font-semibold tracking-tight sm:text-6xl"
          >
            Explore useful things.
          </h1>
        </div>
        <Skeleton className="h-10 w-full max-w-md" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-[210px]" />
      </div>
      <LoadingGrid />
    </section>
  );
}
