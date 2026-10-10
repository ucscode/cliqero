/* eslint-disable @next/next/no-img-element -- storage provider URLs are runtime-configured. */

"use client";

import Link from "next/link";
import type { Listing } from "@/lib/api-client";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { ListingPrice } from "./price";
import { ListingDescription } from "./description";
import { LockKeyhole, Star } from "lucide-react";
import { listingCoverImageUrl, listingImageSource } from "@/modules/listing/external-image";

export function compactCategoryLabel(categories: readonly { name: string }[]) {
  const ordered = [...categories].sort((a, b) => {
    const left = a.name.toLowerCase();
    const right = b.name.toLowerCase();
    return left < right ? -1 : left > right ? 1 : 0;
  });
  if (ordered.length <= 2) return ordered.map((category) => category.name).join(" · ");
  return `${ordered[0]!.name} · ${ordered[1]!.name} +${ordered.length - 2}`;
}

export function ListingCard({
  listing,
  reviewsVisible,
}: {
  listing: Listing;
  reviewsVisible: boolean;
}) {
  const image = listing.media[0];
  const imageUrl = listingCoverImageUrl(listing.metadata, image?.url) ?? undefined;
  const imageAlt =
    listingImageSource(listing.metadata, Boolean(image?.url)) === "uploaded"
      ? image?.alt_text || listing.title
      : listing.title;
  return (
    <Card className="flex h-full flex-col overflow-hidden transition-transform hover:-translate-y-0.5 hover:border-emerald-300">
      <div className="relative">
        <Link href={`/listings/${listing.id}`} className="block">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={imageAlt}
              className="block aspect-[1.34] w-full object-cover"
            />
          ) : (
            <div className="grid aspect-[1.34] place-items-center bg-slate-100 text-4xl font-bold text-slate-400">
              <span>{listing.title.slice(0, 1).toUpperCase()}</span>
            </div>
          )}
        </Link>
        {listing.visibility === "authenticated" && (
          <span
            className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-slate-950/90 px-2.5 py-1 text-xs font-medium text-white shadow-sm"
            aria-label="Members only: sign in required to view this listing"
          >
            <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
            Members only
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex min-h-5 items-center justify-between gap-3">
          {listing.categories.length > 0 && (
            <p
              className="min-w-0 truncate whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate-500"
              title={listing.categories.map((category) => category.name).join(" · ")}
              aria-label={`Categories: ${listing.categories.map((category) => category.name).join(", ")}`}
            >
              {compactCategoryLabel(listing.categories)}
            </p>
          )}
          <span
            className="ml-auto inline-flex shrink-0 items-center gap-1 text-sm text-slate-600"
            aria-label={
              reviewsVisible && (listing.rating?.count ?? 0) > 0 && listing.rating
                ? `${listing.rating.average.toFixed(1)} out of 5 stars`
                : "No reviews yet"
            }
          >
            <Star
              className={
                reviewsVisible && (listing.rating?.count ?? 0) > 0 && listing.rating
                  ? "h-4 w-4 fill-amber-400 text-amber-500"
                  : "h-4 w-4 text-slate-400"
              }
              aria-hidden="true"
            />
            <span className="font-medium">
              {reviewsVisible && (listing.rating?.count ?? 0) > 0 && listing.rating
                ? listing.rating.average.toFixed(1)
                : "0.0"}
            </span>
          </span>
        </div>
        <h3 className="mb-0 line-clamp-2 break-words text-lg font-semibold tracking-tight">
          <Link href={`/listings/${listing.id}`}>{listing.title}</Link>
        </h3>
        <ListingDescription
          className="min-h-[4.35rem] text-sm leading-relaxed text-slate-500"
          description={listing.short_description}
        />
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
          <ListingPrice
            minorAmount={listing.price.minor_amount}
            currency={listing.price.currency}
            compareAtMinorAmount={listing.compare_at_price?.minor_amount}
          />
          <Button asChild size="sm">
            <Link href={`/listings/${listing.id}`}>View details</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
