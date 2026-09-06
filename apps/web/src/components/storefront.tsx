"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { apiFetch, type Listing, type ListingPage, ApiClientError } from "@/lib/api-client";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";
import { ListingCard } from "./listing-card";
import { HoneypotField } from "./honeypot-field";

const sortOptions = [
  ["newest", "Newest"],
  ["oldest", "Oldest"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["title_asc", "Title: A–Z"],
] as const;

export function Storefront({ reviewsVisible }: { reviewsVisible: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const sort = searchParams.get("sort") ?? "newest";
  const cursor = searchParams.get("cursor") ?? "";
  const trail = searchParams.get("trail")?.split(",").filter(Boolean) ?? [];
  const [draft, setDraft] = useState(query);
  const [page, setPage] = useState<ListingPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // The address bar is the catalogue state authority after navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(query);
  }, [query]);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (query) params.set("search", query);
    if (sort !== "newest") params.set("sort", sort);
    if (cursor) params.set("cursor", cursor);
    void apiFetch<ListingPage>(`/api/listings?${params}`)
      .then((result) => {
        if (active) setPage(result);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof ApiClientError ? cause.message : "We couldn't load the catalogue.",
          );
      });
    return () => {
      active = false;
    };
  }, [query, sort, cursor]);
  function navigate(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`${pathname}?${params}`);
  }
  function next() {
    if (!page?.next_cursor) return;
    navigate({ cursor: page.next_cursor, trail: cursor ? [...trail, cursor].join(",") : null });
  }
  function previous() {
    navigate({ cursor: trail.at(-1) ?? null, trail: trail.slice(0, -1).join(",") || null });
  }
  return (
    <section className="grid gap-8" aria-labelledby="catalogue-heading">
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1 id="catalogue-heading" className="!mb-0 !text-4xl sm:!text-5xl">
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
          <HoneypotField />
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
        </form>
      </div>
      <div className="flex justify-end">
        <Select
          value={sort}
          onChange={(event) =>
            navigate({
              sort: event.target.value === "newest" ? null : event.target.value,
              cursor: null,
              trail: null,
            })
          }
          className="w-[210px]"
          aria-label="Sort catalogue"
        >
          {sortOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      {error && <Toast>{error}</Toast>}
      {!page ? (
        <LoadingGrid />
      ) : page.items.length ? (
        <>
          <ListingGrid listings={page.items} reviewsVisible={reviewsVisible} />
          <nav
            className="flex items-center justify-between border-t border-slate-200 pt-6"
            aria-label="Catalogue pages"
          >
            <Button variant="secondary" disabled={!cursor} onClick={previous}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-slate-600">Page {trail.length + (cursor ? 2 : 1)}</span>
            <Button variant="secondary" disabled={!page.next_cursor} onClick={next}>
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
          <h1 id="catalogue-heading" className="!mb-0 !text-4xl sm:!text-5xl">
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

export function FeaturedStorefront({ reviewsVisible }: { reviewsVisible: boolean }) {
  const [page, setPage] = useState<ListingPage | null>(null);
  useEffect(() => {
    void apiFetch<ListingPage>("/api/listings?featured=true").then(setPage);
  }, []);
  return (
    <section className="mt-12 border-t border-slate-200 pt-10" aria-labelledby="featured-listings">
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Selected catalogue</p>
          <h2 id="featured-listings" className="!mb-0 !text-3xl">
            Featured listings
          </h2>
        </div>
        <Button asChild variant="secondary">
          <Link href="/catalogue">View all</Link>
        </Button>
      </div>
      {!page ? (
        <LoadingGrid />
      ) : page.items.length ? (
        <ListingGrid listings={page.items} reviewsVisible={reviewsVisible} />
      ) : (
        <p className="text-slate-600">New catalogue selections are coming soon.</p>
      )}
    </section>
  );
}
function ListingGrid({
  listings,
  reviewsVisible,
}: {
  listings: Listing[];
  reviewsVisible: boolean;
}) {
  return (
    <div className="grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((listing) => (
        <ListingCard listing={listing} key={listing.id} reviewsVisible={reviewsVisible} />
      ))}
    </div>
  );
}
function LoadingGrid() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <Card key={index} className="overflow-hidden">
          <Skeleton className="aspect-[1.34] rounded-none" />
          <div className="grid gap-3 p-5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </Card>
      ))}
    </div>
  );
}
