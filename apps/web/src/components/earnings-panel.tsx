"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiClientError,
  apiFetch,
  type EarningsEntry,
  type EarningsEntryPage,
  type EarningsSummary,
} from "@/lib/api-client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";
import { Money } from "./money";

function label(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function EarningsPanel() {
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [entries, setEntries] = useState<EarningsEntryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [earningSummary, entryPage] = await Promise.all([
        apiFetch<EarningsSummary>("/api/earnings"),
        apiFetch<EarningsEntryPage>("/api/earnings/entries?limit=25"),
      ]);
      setSummary(earningSummary);
      setEntries(entryPage);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "We couldn’t load your earnings.");
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
    <section className="grid gap-4" aria-labelledby="earnings-heading">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Earnings</p>
          <h2 id="earnings-heading">Referral earnings</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Ledger-backed commission activity. Pending earnings become available only when the
            settlement process says they are ready.
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
        <div className="grid gap-4 md:grid-cols-3" aria-label="Loading earnings">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {(summary?.balances ?? []).length ? (
              summary!.balances.map((balance) => (
                <Card className="p-5" key={`${balance.currency}-${balance.state}`}>
                  <p className="eyebrow">{label(balance.state)}</p>
                  <h3>
                    <Money minor={balance.amount_minor} currency={balance.currency} />
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-500">
                    {balance.currency} ledger projection
                  </p>
                </Card>
              ))
            ) : (
              <Card className="p-5">
                <p className="eyebrow">Available</p>
                <h3>
                  <Money minor="0" currency="USD" />
                </h3>
                <p className="text-sm leading-relaxed text-slate-500">
                  Your referral earnings will appear after qualifying purchases settle.
                </p>
              </Card>
            )}
          </div>
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3>Ready to withdraw?</h3>
                <p className="text-sm leading-relaxed text-slate-500">
                  Only available earnings can be requested for payout.
                </p>
              </div>
              <Button asChild>
                <Link href="/dashboard?section=withdrawals">Withdraw earnings</Link>
              </Button>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h3>Earnings activity</h3>
              {entries?.items.length ? (
                <Badge variant="destructive">{entries.items.length}</Badge>
              ) : null}
            </div>
            {entries?.items.length ? (
              <div className="grid">
                {entries.items.map((entry) => (
                  <EarningRow entry={entry} key={entry.id} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No earnings yet"
                description="Qualifying referral commissions will be recorded here as immutable ledger entries."
              />
            )}
          </Card>
        </>
      )}
    </section>
  );
}

function EarningRow({ entry }: { entry: EarningsEntry }) {
  const signedMinor = entry.direction === "debit" ? `-${entry.amount_minor}` : entry.amount_minor;
  const tone = entry.balance_state === "available" ? "success" : "accent";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-200 py-3 last:border-0">
      <div className="grid min-w-0 gap-1">
        <strong>{label(entry.entry_type)}</strong>
        <span className="text-xs text-slate-500">
          {label(entry.balance_state)} · {new Date(entry.created_at).toLocaleDateString()}
        </span>
      </div>
      <div className="grid justify-items-end gap-1 whitespace-nowrap">
        <Badge variant={tone === "success" ? "default" : "destructive"}>
          {label(entry.balance_state)}
        </Badge>
        <Money minor={signedMinor} currency={entry.currency} />
      </div>
      {entry.purchase_id && (
        <small className="col-span-full break-all text-xs text-slate-500">
          Purchase {entry.purchase_id}
        </small>
      )}
    </div>
  );
}
