"use client";

import { useEffect, useState } from "react";
import { apiFetch, type Listing, type ListingPage, ApiClientError } from "@/lib/api-client";
import { Button, EmptyState, Input, Skeleton, Toast } from "./ui";
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
      <section className="storefront-intro">
        <div>
          <p className="eyebrow">The Cliqero catalogue</p>
          <h1>
            Find something worth
            <br />
            <em>making yours.</em>
          </h1>
          <p className="intro-copy">
            Thoughtful digital experiences, gathered in one clear place. Browse the catalogue and
            choose your next useful thing.
          </p>
        </div>
        <div className="intro-note">
          <span className="note-dot" />
          <p>
            One wallet.
            <br />
            Every possibility.
          </p>
        </div>
      </section>
      <section className="catalogue-section" aria-labelledby="catalogue-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Explore</p>
            <h2 id="catalogue-heading">Latest from the catalogue</h2>
          </div>
          <form
            className="search-form"
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
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        </div>
        {error && (
          <Toast>
            <span>{error}</span>
            <button onClick={() => window.location.reload()}>Try again</button>
          </Toast>
        )}
        {loading ? (
          <div className="listing-grid">
            {Array.from({ length: 6 }, (_, index) => (
              <CardSkeleton key={index} />
            ))}
          </div>
        ) : listings.length ? (
          <div className="listing-grid">
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
    <div className="card skeleton-card">
      <Skeleton className="skeleton-image" />
      <div className="skeleton-lines">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    </div>
  );
}
