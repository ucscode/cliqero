"use client";

/* eslint-disable @next/next/no-img-element -- storage provider URLs are runtime-configured. */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { apiFetch, type Listing, ApiClientError } from "@/lib/api-client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";
import { Money } from "./money";
import { canShowPromote, postAuthBuyPath } from "./interaction-model";
import { ReferralShareActions } from "./referral-share-actions";

export function ListingDetail({ id }: { id: string }) {
  const router = useRouter();
  const session = authClient.useSession();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [promoteMessage, setPromoteMessage] = useState<string | null>(null);
  const [referralUrl, setReferralUrl] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  useEffect(() => {
    void apiFetch<Listing>(`/api/listings/${id}`)
      .then(setListing)
      .catch((error: unknown) =>
        setMessage(
          error instanceof ApiClientError && error.status === 404
            ? "This listing is no longer available."
            : "We couldn't load this listing.",
        ),
      )
      .finally(() => setLoading(false));
  }, [id]);
  if (loading)
    return (
      <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 sm:px-8">
        <Skeleton className="h-96 w-full" />
      </main>
    );
  if (!listing)
    return (
      <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 sm:px-8">
        <EmptyState
          title="Listing unavailable"
          description={message ?? "This listing could not be found."}
        />
        <Button asChild variant="secondary">
          <Link href="/">Back to catalogue</Link>
        </Button>
      </main>
    );
  const currentListing = listing;
  const image = currentListing.media[0];
  function buy() {
    if (!session.data?.user) {
      router.push(`/login?next=${encodeURIComponent(postAuthBuyPath(currentListing.id))}`);
      return;
    }
    router.push(postAuthBuyPath(currentListing.id));
  }
  function promote() {
    setPromoting(true);
    setPromoteMessage(null);
    void apiFetch<{ url: string }>(`/api/listings/${currentListing.id}/referral-link`, {
      method: "POST",
    })
      .then(async (result) => {
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
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
      <Link
        href="/"
        className="mb-8 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-900"
      >
        ← Back to catalogue
      </Link>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="grid content-start gap-3">
          {image ? (
            <img
              src={image.url}
              alt={image.alt_text || currentListing.title}
              className="block max-h-[620px] w-full rounded-xl border border-slate-200 object-cover"
            />
          ) : (
            <div className="grid aspect-[1.34] place-items-center rounded-xl bg-slate-100 text-5xl font-bold text-slate-400">
              <span>{currentListing.title.slice(0, 1).toUpperCase()}</span>
            </div>
          )}
          {currentListing.media.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {currentListing.media.map((media) => (
                <img
                  src={media.url}
                  alt={media.alt_text || ""}
                  key={media.id}
                  className="h-16 w-16 rounded-md border border-slate-200 object-cover"
                />
              ))}
            </div>
          )}
        </div>
        <Card className="h-fit p-6 sm:p-8">
          <div className="mb-5">
            <Badge variant="destructive">In the catalogue</Badge>
          </div>
          <h1 className="!mb-4 !text-4xl !leading-tight sm:!text-5xl">{currentListing.title}</h1>
          <div className="mb-5 text-2xl font-bold tracking-tight">
            <Money
              minor={currentListing.price.minor_amount}
              currency={currentListing.price.currency}
            />
          </div>
          <p className="mb-8 leading-relaxed text-slate-600">{currentListing.description}</p>
          <div className="grid gap-3">
            <Button onClick={buy}>Buy now</Button>
            {canShowPromote(Boolean(session.data?.user)) && (
              <Button variant="secondary" onClick={promote} disabled={promoting}>
                {promoting ? "Preparing link…" : referralUrl ? "Refresh link" : "Promote"}
              </Button>
            )}
            {promoteMessage && <Toast tone="success">{promoteMessage}</Toast>}
            {referralUrl && <ReferralShareActions url={referralUrl} />}
          </div>
          <p className="mt-6 text-xs text-slate-500">Secure access through Cliqero</p>
        </Card>
      </div>
    </main>
  );
}
