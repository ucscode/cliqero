"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, ApiClientError, type ListingPage } from "@/lib/api-client";
import { Button } from "../ui/button";
import { Toast } from "../toast";
import { LoadingGrid, ListingGrid } from "./grid";
import {
  listingPageRequestFailed,
  listingPageRequestStarted,
  listingPageRequestSucceeded,
  type ListingPageRequestState,
} from "./request-state";

export function FeaturedStorefront({ reviewsVisible }: { reviewsVisible: boolean }) {
  const requestKey = "featured";
  const [request, setRequest] = useState<ListingPageRequestState>(() =>
    listingPageRequestStarted(requestKey),
  );
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    let active = true;
    void apiFetch<ListingPage>("/api/listings?featured=true")
      .then((page) => {
        if (active) setRequest(listingPageRequestSucceeded(requestKey, page));
      })
      .catch((cause: unknown) => {
        if (active)
          setRequest(
            listingPageRequestFailed(
              requestKey,
              cause instanceof ApiClientError
                ? cause.message
                : "We couldn’t load featured listings right now.",
            ),
          );
      });
    return () => {
      active = false;
    };
  }, [requestKey, requestVersion]);
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
      {request.status === "loading" ? (
        <LoadingGrid />
      ) : request.status === "error" ? (
        <div className="grid justify-items-start gap-3">
          <Toast>{request.error}</Toast>
          <Button variant="secondary" onClick={() => setRequestVersion((version) => version + 1)}>
            Try again
          </Button>
        </div>
      ) : request.page?.items.length ? (
        <ListingGrid listings={request.page.items} reviewsVisible={reviewsVisible} />
      ) : (
        <p className="text-slate-600">New catalogue selections are coming soon.</p>
      )}
    </section>
  );
}
