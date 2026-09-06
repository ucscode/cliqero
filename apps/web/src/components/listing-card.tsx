/* eslint-disable @next/next/no-img-element -- storage provider URLs are runtime-configured. */

"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import type { Listing } from "@/lib/api-client";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Toast } from "./toast";
import { Money } from "./money";
import { canShowPromote } from "./interaction-model";
import { ReferralShareActions } from "./referral-share-actions";
import { ListingDescription } from "./listing-description";
import { Star } from "lucide-react";

export function ListingCard({
  listing,
  reviewsVisible,
}: {
  listing: Listing;
  reviewsVisible: boolean;
}) {
  const image = listing.media[0];
  const session = authClient.useSession();
  const [promoting, setPromoting] = useState(false);
  const [promoteMessage, setPromoteMessage] = useState<string | null>(null);
  const [referralUrl, setReferralUrl] = useState<string | null>(null);
  function promote() {
    setPromoting(true);
    setPromoteMessage(null);
    void apiFetch<{ url: string }>(`/api/listings/${listing.id}/referral-link`, { method: "POST" })
      .then((result) => {
        setReferralUrl(result.url);
        setPromoteMessage("Your referral link is ready to share.");
      })
      .catch((cause: unknown) => {
        setPromoteMessage(
          cause instanceof ApiClientError
            ? cause.message
            : "We couldn’t create your referral link.",
        );
      })
      .finally(() => setPromoting(false));
  }
  return (
    <Card className="flex h-full flex-col overflow-hidden transition-transform hover:-translate-y-0.5 hover:border-emerald-300">
      <Link href={`/listings/${listing.id}`} className="block">
        {image ? (
          <img
            src={image.url}
            alt={image.alt_text || listing.title}
            className="block aspect-[1.34] w-full object-cover"
          />
        ) : (
          <div className="grid aspect-[1.34] place-items-center bg-slate-100 text-4xl font-bold text-slate-400">
            <span>{listing.title.slice(0, 1).toUpperCase()}</span>
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-4 p-5">
        {typeof listing.metadata.category === "string" && listing.metadata.category.trim() && (
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {listing.metadata.category}
          </p>
        )}
        <h3 className="!mb-0 line-clamp-2 break-words !text-lg">
          <Link href={`/listings/${listing.id}`}>{listing.title}</Link>
        </h3>
        {reviewsVisible && (
          <p
            className="flex items-center gap-1 text-sm text-slate-600"
            aria-label={
              listing.rating ? `${listing.rating.average} out of 5 stars` : "No ratings yet"
            }
          >
            <Star
              className={`h-4 w-4 ${listing.rating ? "fill-amber-400 text-amber-500" : "text-slate-300"}`}
              aria-hidden="true"
            />
            {listing.rating && (
              <span className="font-medium">{listing.rating.average.toFixed(1)}</span>
            )}
          </p>
        )}
        <ListingDescription
          className="min-h-[4.35rem] text-sm leading-relaxed text-slate-500"
          description={listing.description}
        />
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
          <Money minor={listing.price.minor_amount} currency={listing.price.currency} />
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={`/listings/${listing.id}`}>View details</Link>
            </Button>
            {canShowPromote(Boolean(session.data?.user)) && (
              <Button variant="secondary" size="sm" onClick={promote} disabled={promoting}>
                {promoting ? "Preparing…" : referralUrl ? "Refresh link" : "Promote"}
              </Button>
            )}
          </div>
        </div>
        {promoteMessage && <Toast tone="success">{promoteMessage}</Toast>}
        {referralUrl && <ReferralShareActions url={referralUrl} />}
      </div>
    </Card>
  );
}
