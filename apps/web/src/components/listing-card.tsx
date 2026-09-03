/* eslint-disable @next/next/no-img-element -- storage provider URLs are runtime-configured. */

"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import type { Listing } from "@/lib/api-client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Money, Toast } from "./ui";
import { canShowPromote } from "./interaction-model";
import { ReferralShareActions } from "./referral-share-actions";

export function ListingCard({ listing }: { listing: Listing }) {
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
    <Card className="overflow-hidden transition-transform hover:-translate-y-0.5 hover:border-emerald-300">
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
      <div className="grid gap-4 p-5">
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
          <Badge variant="destructive">Featured</Badge>
          <span>Cliqero catalogue</span>
        </div>
        <h3 className="!mb-0 !text-lg">
          <Link href={`/listings/${listing.id}`}>{listing.title}</Link>
        </h3>
        <p className="min-h-0 text-sm leading-relaxed text-slate-500">
          {listing.description || "A considered way to move forward."}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Money minor={listing.price.minor_amount} currency={listing.price.currency} />
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={`/listings/${listing.id}`}>Buy</Link>
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
