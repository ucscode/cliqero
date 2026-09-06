"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { apiFetch, type ListingReview, type ListingReviewPage } from "@/lib/api-client";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { HoneypotField } from "./honeypot-field";

export function ListingReviews({ listingId }: { listingId: string }) {
  const session = authClient.useSession();
  const [reviews, setReviews] = useState<ListingReview[]>([]);
  const [mine, setMine] = useState<ListingReview | null>(null);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void apiFetch<ListingReviewPage>(`/api/listings/${listingId}/reviews`).then((page) =>
      setReviews(page.items),
    );
    if (session.data?.user)
      void apiFetch<{ item: ListingReview | null }>(`/api/listings/${listingId}/reviews/me`).then(
        ({ item }) => {
          setMine(item);
          if (item) {
            setRating(item.rating);
            setBody(item.body);
          }
        },
      );
  }, [listingId, session.data?.user]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    try {
      const website = String(new FormData(event.currentTarget).get("website") ?? "");
      const result = await apiFetch<{ item: ListingReview }>(
        `/api/listings/${listingId}/reviews/me`,
        { method: "PUT", body: JSON.stringify({ rating, body, website }) },
      );
      setMine(result.item);
      setMessage("Your review is awaiting approval.");
    } catch {
      setMessage("We couldn't submit your review. Please try again.");
    }
  }
  return (
    <div className="mt-7 grid gap-6">
      {session.data?.user && (
        <form className="mt-7 grid gap-4" onSubmit={submit}>
          <HoneypotField />
          <fieldset>
            <legend className="text-sm font-medium">Your rating</legend>
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className="rounded p-1 focus-visible:ring-2 focus-visible:ring-emerald-600"
                  onClick={() => setRating(value)}
                  aria-label={`${value} star${value === 1 ? "" : "s"}`}
                  aria-pressed={rating === value}
                >
                  <Star
                    className={`h-6 w-6 ${value <= rating ? "fill-amber-400 text-amber-500" : "text-slate-300"}`}
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
          {mine && (
            <p className="text-sm text-slate-600">
              Current status: <span className="font-medium capitalize">{mine.status}</span>
            </p>
          )}
          {message && (
            <p role="status" className="text-sm text-slate-700">
              {message}
            </p>
          )}
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
