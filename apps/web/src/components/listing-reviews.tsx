"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  ApiClientError,
  apiFetch,
  type ListingReview,
  type ListingReviewPage,
} from "@/lib/api-client";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { HoneypotField } from "./honeypot-field";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";

export function visibleRating(selectedRating: number, hoverRating: number) {
  return hoverRating || selectedRating;
}

export function replaceOwnReview(reviews: readonly ListingReview[], review: ListingReview) {
  return [review, ...reviews.filter((item) => item.id !== review.id && !item.is_mine)];
}

export function ListingReviews({ listingId }: { listingId: string }) {
  const session = authClient.useSession();
  const [reviews, setReviews] = useState<ListingReview[]>([]);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const displayRating = visibleRating(rating, hoverRating);

  useEffect(() => {
    let cancelled = false;
    void apiFetch<ListingReviewPage>(`/api/listings/${listingId}/reviews`)
      .then((page) => {
        if (cancelled) return;
        setReviews(page.items);
        const mine = page.items.find((item) => item.is_mine);
        if (mine) {
          setRating(mine.rating);
          setBody(mine.body);
        } else {
          setRating(0);
          setBody("");
        }
        setHoverRating(0);
      })
      .catch(() => {
        if (!cancelled) setError("We couldn’t load reviews. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [listingId, session.data?.user]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!rating) {
      setError("Choose a rating before submitting your review.");
      return;
    }
    try {
      const honeypot = String(new FormData(event.currentTarget).get(HONEYPOT_FIELD_NAME) ?? "");
      const result = await apiFetch<{ item: ListingReview }>(
        `/api/listings/${listingId}/reviews/me`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            ...(honeypot ? { [HONEYPOT_HEADER_NAME]: honeypot } : {}),
          },
          body: JSON.stringify({ rating, body }),
        },
      );
      setReviews((current) => replaceOwnReview(current, result.item));
      setRating(result.item.rating);
      setBody(result.item.body);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "We couldn't submit your review.");
    }
  }

  return (
    <div className="mt-7 grid gap-6">
      {session.data?.user && (
        <form className="mt-7 grid gap-4" onSubmit={submit}>
          <fieldset>
            <legend className="text-sm font-medium">Your rating</legend>
            <div className="mt-2 flex gap-1" onPointerLeave={() => setHoverRating(0)}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className="rounded p-1 focus-visible:ring-2 focus-visible:ring-emerald-600"
                  onBlur={() => setHoverRating(0)}
                  onFocus={() => setHoverRating(value)}
                  onPointerEnter={() => setHoverRating(value)}
                  onClick={() => setRating(value)}
                  aria-label={`Rate ${value} out of 5`}
                  aria-pressed={rating === value}
                >
                  <Star
                    className={`h-6 w-6 ${value <= displayRating ? "fill-amber-400 text-amber-500" : "text-slate-300"}`}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-2">
            <Label htmlFor="review-body">Review (optional)</Label>
            <Textarea
              id="review-body"
              value={body}
              maxLength={2000}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
          <Button className="w-fit" type="submit">
            Submit review
          </Button>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <HoneypotField />
        </form>
      )}
      <div className="grid gap-6">
        {reviews.map((review) => (
          <article key={review.id}>
            <p className="flex items-center gap-1 text-sm text-slate-700">
              <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />
              <span>{review.rating} / 5</span>
              <span>·</span>
              <span className="font-medium">{review.reviewer}</span>
              <span>·</span>
              <time dateTime={review.created_at}>
                {new Date(review.created_at).toLocaleDateString()}
              </time>
            </p>
            {review.body && (
              <p className="mt-2 whitespace-pre-wrap leading-relaxed text-slate-700">
                {review.body}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
