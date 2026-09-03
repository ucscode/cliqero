"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiClientError, type Purchase, type PurchasePage } from "@/lib/api-client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";
import { Money } from "./money";

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
      <div className="grid gap-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );

  return (
    <section className="grid gap-4" aria-labelledby="purchases-heading">
      {error && <Toast>{error}</Toast>}
      <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
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
        <div className="grid gap-3">
          {purchases.map((purchase) => (
            <Card className="grid gap-4 p-5" key={purchase.id}>
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <p className="eyebrow">{new Date(purchase.created_at).toLocaleDateString()}</p>
                  <h3>{purchase.title}</h3>
                  <p className="m-0 text-sm text-slate-500">{accessLabel(purchase)}</p>
                </div>
                <div className="grid content-start justify-items-end gap-2 whitespace-nowrap">
                  <Money minor={purchase.amount_minor} currency={purchase.currency} />
                  <Badge variant={purchase.state === "completed" ? "default" : "destructive"}>
                    {purchaseLabel(purchase.state)}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {purchase.access_available ? (
                  <Button asChild>
                    <a href={`/access/${purchase.id}`}>Open access</a>
                  </Button>
                ) : (
                  <span
                    className="inline-flex min-h-10 items-center text-sm text-slate-500"
                    aria-live="polite"
                  >
                    {accessLabel(purchase)}
                  </span>
                )}
                <Button asChild variant="secondary">
                  <Link href={`/dashboard?section=purchases&purchase=${purchase.id}`}>Details</Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {selected && (
        <Card className="grid gap-3 p-5" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
            <span>Purchase detail</span>
            {refreshing && <span className="text-xs text-slate-500">Updating…</span>}
          </div>
          <h3>{selected.title}</h3>
          <p>
            {purchaseLabel(selected.state)} · {accessLabel(selected)}
          </p>
          <Money minor={selected.amount_minor} currency={selected.currency} />
          {selected.access_available && (
            <Button asChild>
              <a href={`/access/${selected.id}`}>Open access</a>
            </Button>
          )}
        </Card>
      )}
    </section>
  );
}
