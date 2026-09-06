"use client";

/* eslint-disable @next/next/no-img-element -- storage provider URLs are runtime-configured. */

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { apiFetch, type Listing, ApiClientError } from "@/lib/api-client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";
import { Money } from "./money";
import { canShowPromote, postAuthBuyPath } from "./interaction-model";
import { ReferralShareActions } from "./referral-share-actions";
import { ListingMarkdown } from "./listing-markdown";
import { TextLink } from "./text-link";
import { ListingReviews } from "./listing-reviews";
import { Star } from "lucide-react";

export function shouldRenderListingReviews(reviewsVisible: boolean, rating: Listing["rating"]) {
  return reviewsVisible && (rating?.count ?? 0) > 0;
}

export function ListingReviewSection({
  reviewsVisible,
  rating,
  children,
}: {
  reviewsVisible: boolean;
  rating: Listing["rating"];
  children?: ReactNode;
}) {
  if (!shouldRenderListingReviews(reviewsVisible, rating) || !rating) return null;
  return (
    <section
      className="mx-auto mt-14 max-w-3xl border-t border-slate-200 pt-10"
      aria-labelledby="reviews-heading"
      data-testid="listing-reviews"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="reviews-heading" className="!mb-0 !text-3xl">
          Reviews
        </h2>
        <p className="flex items-center gap-1 text-slate-600">
          <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />
          <span aria-label={`${rating.average} out of 5 from ${rating.count} reviews`}>
            {rating.average.toFixed(1)} · {rating.count} {rating.count === 1 ? "review" : "reviews"}
          </span>
        </p>
      </div>
      {children}
    </section>
  );
}

export function ListingDetail({ id, reviewsVisible }: { id: string; reviewsVisible: boolean }) {
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
  const hasApprovedReviews = shouldRenderListingReviews(reviewsVisible, currentListing.rating);
  const approvedRating = hasApprovedReviews ? currentListing.rating! : null;
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
      <TextLink href="/catalogue" className="mb-8 inline-flex text-sm">
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
        <aside className="h-fit py-2 lg:sticky lg:top-24">
          {category && (
            <Badge variant="secondary" className="mb-5 w-fit">
              {category}
            </Badge>
          )}
          <h1 id="listing-title" className="!mb-4 !text-4xl !leading-tight sm:!text-5xl">
            {currentListing.title}
          </h1>
          {approvedRating && (
            <p
              className="mb-5 flex items-center gap-1 text-sm text-slate-600"
              aria-label={`${approvedRating.average} out of 5 from ${approvedRating.count} reviews`}
            >
              <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />
              <span className="font-medium">{approvedRating.average.toFixed(1)}</span>
              <span>
                · {approvedRating.count} {approvedRating.count === 1 ? "review" : "reviews"}
              </span>
            </p>
          )}
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
        </aside>
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
          <Button className="mt-8" onClick={buy}>
            Buy now
          </Button>
        </section>
      )}
      <ListingReviewSection reviewsVisible={reviewsVisible} rating={currentListing.rating}>
        <ListingReviews listingId={currentListing.id} />
      </ListingReviewSection>
    </main>
  );
}
