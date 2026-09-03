"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ApiClientError,
  apiFetch,
  type ReferralLink,
  type ReferralLinkPage,
} from "@/lib/api-client";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";
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
    <section className="grid gap-4" aria-labelledby="promote-heading">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Promote</p>
          <h2 id="promote-heading">Your promotional links</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
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
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </Toast>
      )}
      {loading ? (
        <div className="grid gap-3" aria-label="Loading promotional links">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : links.length === 0 ? (
        <EmptyState
          title="No promotional links yet"
          description="Open a published listing and choose Promote to create your first shareable link."
        />
      ) : (
        <div className="grid gap-3">
          {links.map((link) => (
            <Card className="grid gap-3 p-5" key={link.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Catalogue listing</p>
                  <h3>{link.listing_title ?? "Unavailable listing"}</h3>
                  <small className="break-all text-xs text-slate-500">
                    Listing {link.listing_id}
                  </small>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold capitalize text-emerald-800">
                  {link.state}
                </span>
              </div>
              <ReferralShareActions url={link.url} compact />
              {link.created_at && (
                <p className="m-0 text-xs text-slate-500">
                  Created {new Date(link.created_at).toLocaleDateString()}
                </p>
              )}
              <Link
                className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
                href={`/listings/${link.listing_id}`}
              >
                View listing ↗
              </Link>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
