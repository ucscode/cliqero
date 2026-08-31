"use client";

/* eslint-disable @next/next/no-img-element -- storage provider URLs are runtime-configured. */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { apiFetch, type Listing, ApiClientError } from "@/lib/api-client";
import { Badge, Button, Card, EmptyState, Money, Skeleton, Toast } from "./ui";
import { canShowPromote, postAuthBuyPath } from "./interaction-model";

export function ListingDetail({ id }: { id: string }) {
  const router = useRouter();
  const session = authClient.useSession();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [promoteMessage, setPromoteMessage] = useState<string | null>(null);
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
      <main className="page-shell">
        <Skeleton className="detail-skeleton" />
      </main>
    );
  if (!listing)
    return (
      <main className="page-shell">
        <EmptyState
          title="Listing unavailable"
          description={message ?? "This listing could not be found."}
        />
        <Link className="button button-secondary" href="/">
          Back to catalogue
        </Link>
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
        try {
          await navigator.clipboard.writeText(result.url);
          setPromoteMessage("Referral link copied. Share it when you’re ready.");
        } catch {
          setPromoteMessage(`Your referral link is ready: ${result.url}`);
        }
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
    <main className="page-shell detail-page">
      <Link href="/" className="back-link">
        ← Back to catalogue
      </Link>
      <div className="detail-grid">
        <div className="detail-gallery">
          {image ? (
            <img
              src={image.url}
              alt={image.alt_text || currentListing.title}
              className="detail-image"
            />
          ) : (
            <div className="detail-image placeholder-image">
              <span>{currentListing.title.slice(0, 1).toUpperCase()}</span>
            </div>
          )}
          {currentListing.media.length > 1 && (
            <div className="gallery-thumbs">
              {currentListing.media.map((media) => (
                <img src={media.url} alt={media.alt_text || ""} key={media.id} />
              ))}
            </div>
          )}
        </div>
        <Card className="detail-card">
          <div className="card-kicker">
            <Badge tone="accent">In the catalogue</Badge>
          </div>
          <h1>{currentListing.title}</h1>
          <div className="detail-price">
            <Money
              minor={currentListing.price.minor_amount}
              currency={currentListing.price.currency}
            />
          </div>
          <p className="detail-description">{currentListing.description}</p>
          <div className="detail-actions">
            <Button onClick={buy}>Buy now</Button>
            {canShowPromote(Boolean(session.data?.user)) && (
              <Button variant="secondary" onClick={promote} disabled={promoting}>
                Promote
              </Button>
            )}
            {promoteMessage && <Toast tone="success">{promoteMessage}</Toast>}
          </div>
          <p className="secure-note">
            <span aria-hidden="true">◈</span> Secure access through Cliqero
          </p>
        </Card>
      </div>
    </main>
  );
}
