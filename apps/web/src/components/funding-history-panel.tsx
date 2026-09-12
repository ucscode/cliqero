"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch, formatMinorCurrency } from "@/lib/api-client";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { Toast } from "./toast";

type FundingHistoryItem = {
  id: string;
  provider: string;
  provider_display_name?: string;
  funding_reference: string;
  state: string;
  amount_minor: string;
  currency: string;
  collection_amount_minor: string;
  collection_currency: string;
  created_at: string | null;
  confirmed_at: string | null;
};

function displayState(state: string) {
  return state.replaceAll("_", " ");
}

export function FundingHistoryPanel() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<FundingHistoryItem[]>([]);
  const [state, setState] = useState("");
  const [activeOnly, setActiveOnly] = useState(searchParams.get("active") === "true");
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams({ limit: "20" });
    if (state) query.set("state", state);
    if (activeOnly) query.set("active", "true");
    if (cursor) query.set("cursor", cursor);
    void apiFetch<{ items: FundingHistoryItem[]; next_cursor: string | null }>(
      `/api/wallet/funding?${query.toString()}`,
    )
      .then((page) => {
        setItems((current) => (cursor ? [...current, ...page.items] : page.items));
        setNextCursor(page.next_cursor);
        setError(null);
      })
      .catch(() => setError("We couldn't load funding history right now."))
      .finally(() => setLoading(false));
  }, [activeOnly, cursor, state]);

  function filter(nextState: string) {
    setLoading(true);
    setItems([]);
    setCursor(null);
    setNextCursor(null);
    setActiveOnly(nextState === "active");
    setState(nextState === "active" ? "" : nextState);
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Wallet funding</p>
          <h2>Funding history</h2>
        </div>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Filter by status</span>
          <select
            className="h-10 rounded-md border border-slate-300 bg-white px-3"
            value={activeOnly ? "active" : state}
            onChange={(event) => filter(event.target.value)}
          >
            <option value="">All funding</option>
            <option value="active">Payments in progress</option>
            <option value="initialization_pending">Preparing</option>
            <option value="initializing">Initializing</option>
            <option value="awaiting_payment">Awaiting payment</option>
            <option value="verification_pending">Verification pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="failed">Failed</option>
            <option value="blocked">Blocked</option>
            <option value="cancelled">Cancelled</option>
            <option value="reconciliation_pending">Reconciliation pending</option>
          </select>
        </label>
      </div>
      {error && <Toast>{error}</Toast>}
      {loading && items.length === 0 ? (
        <Skeleton className="h-48 w-full" />
      ) : items.length === 0 ? (
        <Card className="p-6 text-sm text-slate-600">No funding attempts match this filter.</Card>
      ) : (
        <div className="grid gap-2">
          {items.map((item) => (
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4" key={item.id}>
              <div className="grid gap-1">
                <strong>{item.provider_display_name ?? "Payment provider"}</strong>
                <code className="text-xs text-slate-500">{item.funding_reference}</code>
                <span className="text-xs text-slate-500">
                  {item.created_at
                    ? new Date(item.created_at).toLocaleString()
                    : "Date unavailable"}
                </span>
              </div>
              <div className="grid justify-items-end gap-1">
                <strong>{formatMinorCurrency(item.amount_minor, item.currency)}</strong>
                <span className="text-xs text-slate-500">
                  Collected{" "}
                  {formatMinorCurrency(item.collection_amount_minor, item.collection_currency)}
                </span>
                <Badge variant={item.state === "confirmed" ? "default" : "secondary"}>
                  {displayState(item.state)}
                </Badge>
                {[
                  "initialization_pending",
                  "initializing",
                  "awaiting_payment",
                  "verification_pending",
                ].includes(item.state) && (
                  <Link
                    className="text-sm font-medium text-emerald-800 underline"
                    href={`/dashboard/wallet/fund?funding=${encodeURIComponent(item.id)}`}
                  >
                    View payment
                  </Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {nextCursor && (
        <button
          className="justify-self-start text-sm font-medium text-emerald-800 underline"
          type="button"
          onClick={() => {
            setLoading(true);
            setCursor(nextCursor);
          }}
          disabled={loading}
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
