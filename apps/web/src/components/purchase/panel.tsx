"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiClientError, type Purchase, type PurchasePage } from "@/lib/api-client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { EmptyState } from "../empty-state";
import { Toast } from "../toast";
import { Money } from "../money";

export function purchaseStatusPresentation(state: Purchase["state"]) {
  switch (state) {
    case "completed":
      return { label: "Completed", variant: "default" as const };
    case "paid":
      return { label: "Paid", variant: "default" as const };
    case "refunded":
      return { label: "Refunded", variant: "secondary" as const };
    case "failed":
      return { label: "Payment failed", variant: "destructive" as const };
    default:
      return { label: "Awaiting payment", variant: "warning" as const };
  }
}

export function purchaseActions(
  purchase: Pick<Purchase, "id" | "listing_id" | "checkout_id" | "state" | "access_available">,
) {
  const actions: Array<{ label: string; href: string }> = [];
  if (purchase.access_available)
    actions.push({ label: "Open access", href: `/access/${purchase.id}` });
  if (purchase.state === "pending")
    actions.push({ label: "Continue to checkout", href: checkoutHref(purchase) });
  return actions;
}

export function purchaseCardDescription(purchase: Pick<Purchase, "short_description">) {
  return purchase.short_description;
}

function accessLabel(purchase: Purchase): string {
  if (purchase.access_available) return "Ready to access";
  if (purchase.state === "paid" || purchase.state === "completed")
    return purchase.entitlement_state === "revoked" ? "Access revoked" : "Access is being prepared";
  return "Complete payment to access";
}

function checkoutHref(purchase: Pick<Purchase, "listing_id" | "checkout_id">): string {
  const params = new URLSearchParams({ buy: purchase.listing_id });
  if (purchase.checkout_id) params.set("checkout", purchase.checkout_id);
  return `/dashboard?${params.toString()}`;
}

export function PurchasesPanel() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const page = await apiFetch<PurchasePage>("/api/purchases?limit=50");
      setPurchases(page.items);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "We couldn't load your purchases.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
                  <p className="m-0 text-sm text-slate-600">{purchaseCardDescription(purchase)}</p>
                  <p className="m-0 text-sm text-slate-500">{accessLabel(purchase)}</p>
                </div>
                <div className="grid content-start justify-items-end gap-2 whitespace-nowrap">
                  <Money minor={purchase.amount_minor} currency={purchase.currency} />
                  <Badge variant={purchaseStatusPresentation(purchase.state).variant}>
                    {purchaseStatusPresentation(purchase.state).label}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {purchaseActions(purchase).length > 0 ? (
                  purchaseActions(purchase).map((action) => (
                    <Button asChild key={action.label}>
                      {action.href.startsWith("/access/") ? (
                        <a href={action.href}>{action.label}</a>
                      ) : (
                        <Link href={action.href}>{action.label}</Link>
                      )}
                    </Button>
                  ))
                ) : (
                  <span
                    className="inline-flex min-h-10 items-center text-sm text-slate-500"
                    aria-live="polite"
                  >
                    {accessLabel(purchase)}
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
