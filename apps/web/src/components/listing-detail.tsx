"use client";

/* eslint-disable @next/next/no-img-element -- storage provider URLs are runtime-configured. */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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
import { ListingMarkdown } from "./listing-markdown";
import { TextLink } from "./text-link";

export function ListingDetail({ id }: { id: string }) {
  const router = useRouter();
  const session = authClient.useSession();
  const [listing, setListing] = useState<Listing | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [promoteMessage, setPromoteMessage] = useState<string | null>(null);
  const [referralUrl, setReferralUrl] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  useEffect(() => {
    void apiFetch<Listing>(`/api/listings/${id}`)
      .then((nextListing) => {
        setListing(nextListing);
        setSelectedMediaId(null);
      })
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
  const image =
    currentListing.media.find((media) => media.id === selectedMediaId) ?? currentListing.media[0];
  const category =
    typeof currentListing.metadata.category === "string" && currentListing.metadata.category.trim()
      ? currentListing.metadata.category
      : null;
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
      <TextLink href="/" className="mb-8 inline-flex text-sm">
        <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
        Back to catalogue
      </TextLink>
      <section
        aria-labelledby="listing-title"
        className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]"
      >
        <div className="grid content-start gap-4">
          {image ? (
            <div className="flex aspect-[4/3] max-h-[620px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <img
                src={image.url}
                alt={image.alt_text || currentListing.title}
                className="block max-h-full w-full object-contain"
              />
            </div>
          ) : (
            <div className="grid aspect-[4/3] max-h-[620px] place-items-center rounded-xl bg-slate-100 text-5xl font-bold text-slate-400">
              <span>{currentListing.title.slice(0, 1).toUpperCase()}</span>
            </div>
          )}
          {currentListing.media.length > 1 && (
            <div className="flex flex-wrap gap-2" aria-label="Listing media">
              {currentListing.media.map((media) => (
                <button
                  type="button"
                  key={media.id}
                  className={`h-16 w-16 overflow-hidden rounded-md border bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${image?.id === media.id ? "border-emerald-700 ring-2 ring-emerald-200" : "border-slate-200"}`}
                  onClick={() => setSelectedMediaId(media.id)}
                  aria-label={`View ${media.alt_text || currentListing.title}`}
                  aria-pressed={image?.id === media.id}
                >
                  <img
                    src={media.url}
                    alt=""
                    className="h-full w-full object-cover"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
        <Card className="h-fit p-6 sm:p-8 lg:sticky lg:top-24">
          {category && (
            <Badge variant="secondary" className="mb-5 w-fit">
              {category}
            </Badge>
          )}
          <h1 id="listing-title" className="!mb-4 !text-4xl !leading-tight sm:!text-5xl">
            {currentListing.title}
          </h1>
          <div className="mb-5 text-2xl font-bold tracking-tight">
            <Money
              minor={currentListing.price.minor_amount}
              currency={currentListing.price.currency}
            />
          </div>
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
        </Card>
      </section>
      {currentListing.description.trim() && (
        <section
          className="mx-auto mt-16 max-w-3xl border-t border-slate-200 pt-10"
          aria-labelledby="about-listing"
        >
          <h2 id="about-listing" className="!mb-6 !text-3xl !leading-tight">
            About this listing
          </h2>
          <ListingMarkdown content={currentListing.description} />
        </section>
      )}
    </main>
  );
}
