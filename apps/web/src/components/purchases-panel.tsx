"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiClientError, type Purchase, type PurchasePage } from "@/lib/api-client";
import { Badge, Button, Card, EmptyState, Money, Skeleton, Toast } from "./ui";

function purchaseLabel(state: Purchase["state"]): string {
  switch (state) {
    case "completed":
      return "Completed";
    case "paid":
      return "Payment confirmed";
    case "refunded":
      return "Refunded";
    case "failed":
      return "Payment failed";
    default:
      return "Awaiting funds";
  }
}

function accessLabel(purchase: Purchase): string {
  if (purchase.access_available) return "Ready to access";
  if (purchase.state === "paid" || purchase.state === "completed")
    return purchase.entitlement_state === "revoked" ? "Access revoked" : "Access is being prepared";
  return "Complete payment to access";
}

export function PurchasesPanel({ selectedId }: { selectedId?: string }) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [selected, setSelected] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (background = false) => {
      if (background) setRefreshing(true);
      else setLoading(true);
      try {
        const page = await apiFetch<PurchasePage>("/api/purchases?limit=50");
        setPurchases(page.items);
        if (selectedId) {
          const match = page.items.find((purchase) => purchase.id === selectedId);
          if (match) setSelected(match);
        }
        setError(null);
      } catch (cause) {
        setError(
          cause instanceof ApiClientError ? cause.message : "We couldn't load your purchases.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedId],
  );

  useEffect(() => {
    // This effect starts the initial network read for the panel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!purchases.some((purchase) => purchase.state === "pending" || !purchase.access_available))
      return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden" || attempts >= 6) return;
      attempts += 1;
      void load(true);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [purchases, load]);

  if (loading)
    return (
      <div className="purchase-skeleton-list">
        <Skeleton className="purchase-skeleton" />
        <Skeleton className="purchase-skeleton" />
        <Skeleton className="purchase-skeleton" />
      </div>
    );

  return (
    <section className="purchases-panel" aria-labelledby="purchases-heading">
      {error && <Toast>{error}</Toast>}
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">Your collection</p>
          <h2 id="purchases-heading">Purchases</h2>
        </div>
        <Button variant="ghost" onClick={() => void load(true)} disabled={refreshing}>
          Refresh
        </Button>
      </div>
      {purchases.length === 0 ? (
        <EmptyState
          title="Your collection is empty"
          description="When you buy something from the catalogue, it will appear here."
        />
      ) : (
        <div className="purchase-list">
          {purchases.map((purchase) => (
            <Card className="purchase-card" key={purchase.id}>
              <div className="purchase-card-main">
                <div>
                  <p className="eyebrow">{new Date(purchase.created_at).toLocaleDateString()}</p>
                  <h3>{purchase.title}</h3>
                  <p className="purchase-status-copy">{accessLabel(purchase)}</p>
                </div>
                <div className="purchase-card-meta">
                  <Money minor={purchase.amount_minor} currency={purchase.currency} />
                  <Badge tone={purchase.state === "completed" ? "success" : "accent"}>
                    {purchaseLabel(purchase.state)}
                  </Badge>
                </div>
              </div>
              <div className="purchase-card-actions">
                {purchase.access_available ? (
                  <a className="button button-primary" href={`/access/${purchase.id}`}>
                    Open access
                  </a>
                ) : (
                  <span className="purchase-processing" aria-live="polite">
                    {accessLabel(purchase)}
                  </span>
                )}
                <Link
                  className="button button-secondary"
                  href={`/dashboard?section=purchases&purchase=${purchase.id}`}
                >
                  Details
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
      {selected && (
        <Card className="purchase-detail-card" aria-live="polite">
          <div className="card-kicker">
            <span>Purchase detail</span>
            {refreshing && <span className="refreshing-label">Updating…</span>}
          </div>
          <h3>{selected.title}</h3>
          <p>
            {purchaseLabel(selected.state)} · {accessLabel(selected)}
          </p>
          <Money minor={selected.amount_minor} currency={selected.currency} />
          {selected.access_available && (
            <a className="button button-primary" href={`/access/${selected.id}`}>
              Open access
            </a>
          )}
        </Card>
      )}
    </section>
  );
}
