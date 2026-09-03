"use client";

import { useEffect, useState } from "react";
import { apiFetch, type Listing, type ListingPage, ApiClientError } from "@/lib/api-client";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";
import { EmptyState, Toast } from "./ui";
import { ListingCard } from "./listing-card";

export function Storefront() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Loading/error state is synchronized with the requested API query.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    const params = submittedQuery ? `?search=${encodeURIComponent(submittedQuery)}` : "";
    void apiFetch<ListingPage>(`/api/listings${params}`)
      .then((page) => {
        if (!cancelled) setListings(page.items);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(
            cause instanceof ApiClientError ? cause.message : "We couldn't load the catalogue.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [submittedQuery]);
  return (
    <>
      <section className="grid items-end gap-10 border-b border-slate-200 py-16 sm:py-24 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-12">
        <div>
          <p className="eyebrow">The Cliqero catalogue</p>
          <h1 className="!mb-6 !max-w-4xl !text-5xl !leading-[0.95] sm:!text-7xl">
            Find something worth
            <br />
            <em>making yours.</em>
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-slate-500">
            Thoughtful digital experiences, gathered in one clear place. Browse the catalogue and
            choose your next useful thing.
          </p>
        </div>
        <div className="border-t-2 border-emerald-700 pt-4 text-slate-500 lg:justify-self-end lg:w-[170px]">
          <span className="block h-2.5 w-2.5 rounded-full bg-emerald-700" aria-hidden="true" />
          <p className="mt-3 text-sm leading-relaxed">
            One wallet.
            <br />
            Every possibility.
          </p>
        </div>
      </section>
      <section className="grid gap-8 pt-12 sm:pt-16" aria-labelledby="catalogue-heading">
        <div className="flex flex-col items-stretch justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="eyebrow">Explore</p>
            <h2 id="catalogue-heading" className="!text-3xl sm:!text-4xl">
              Latest from the catalogue
            </h2>
          </div>
          <form
            className="flex w-full max-w-md gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmittedQuery(query.trim());
            }}
          >
            <label className="sr-only" htmlFor="catalogue-search">
              Search catalogue
            </label>
            <Input
              id="catalogue-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search listings"
            />
            <Button type="submit" variant="secondary" className="shrink-0">
              Search
            </Button>
          </form>
        </div>
        {error && (
          <Toast>
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </Toast>
        )}
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <CardSkeleton key={index} />
            ))}
          </div>
        ) : listings.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <ListingCard listing={listing} key={listing.id} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nothing here yet"
            description={
              submittedQuery
                ? "Try a different search term."
                : "The catalogue is being prepared. Check back soon."
            }
          />
        )}
      </section>
    </>
  );
}

function CardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-[1.34] rounded-none" />
      <div className="grid gap-3 p-5">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </Card>
  );
}
