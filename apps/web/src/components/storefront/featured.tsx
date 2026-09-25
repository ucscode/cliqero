"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, type ListingPage } from "@/lib/api-client";
import { Button } from "../ui/button";
import { LoadingGrid, ListingGrid } from "./grid";

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
          <h2 id="featured-listings" className="mb-0 text-3xl font-semibold tracking-tight">
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
