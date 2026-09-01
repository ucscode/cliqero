"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ApiClientError,
  apiFetch,
  type ReferralLink,
  type ReferralLinkPage,
} from "@/lib/api-client";
import { Button, Card, EmptyState, Skeleton, Toast } from "./ui";
import { ReferralShareActions } from "./referral-share-actions";

export function PromotePanel() {
  const [links, setLinks] = useState<ReferralLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await apiFetch<ReferralLinkPage>("/api/referral-links");
      setLinks(page.items);
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "We couldn’t load your promotional links.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial data loading synchronizes this client panel with the remote API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <section className="referral-panel" aria-labelledby="promote-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Promote</p>
          <h2 id="promote-heading">Your promotional links</h2>
          <p className="panel-intro">
            Share a listing with your network. A qualifying purchase may create referral earnings; a
            visit alone never guarantees a commission.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {error && (
        <Toast>
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>
            Try again
          </button>
        </Toast>
      )}
      {loading ? (
        <div className="referral-list" aria-label="Loading promotional links">
          <Skeleton className="referral-skeleton" />
          <Skeleton className="referral-skeleton" />
        </div>
      ) : links.length === 0 ? (
        <EmptyState
          title="No promotional links yet"
          description="Open a published listing and choose Promote to create your first shareable link."
        />
      ) : (
        <div className="referral-list">
          {links.map((link) => (
            <Card className="referral-link-card" key={link.id}>
              <div className="referral-link-heading">
                <div>
                  <p className="eyebrow">Catalogue listing</p>
                  <h3>{link.listing_title ?? "Unavailable listing"}</h3>
                  <small className="referral-link-id">Listing {link.listing_id}</small>
                </div>
                <span className={`status-dot status-${link.state}`}>{link.state}</span>
              </div>
              <ReferralShareActions url={link.url} compact />
              {link.created_at && (
                <p className="panel-note referral-link-date">
                  Created {new Date(link.created_at).toLocaleDateString()}
                </p>
              )}
              <Link className="arrow-link" href={`/listings/${link.listing_id}`}>
                View listing ↗
              </Link>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
