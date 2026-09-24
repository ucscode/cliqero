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
import { findWithdrawableBalance } from "./earnings/withdrawable";

const EARNINGS_PAGE_SIZE = 25;

function label(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function customerEarningLabel(
  entry: Pick<EarningsEntry, "entry_type" | "direction" | "recipient_role">,
) {
  if (entry.entry_type === "purchase-earnings" && entry.direction === "credit") {
    if (entry.recipient_role === "referral") return "Referral commission";
    if (entry.recipient_role === "seller") return "Sale proceeds";
  }
  if (entry.entry_type === "purchase-reversal" && entry.direction === "debit") {
    if (entry.recipient_role === "referral") return "Commission reversal";
    if (entry.recipient_role === "seller") return "Sale reversal";
  }
  return "Earnings adjustment";
}

export function customerEarningAmount(entry: Pick<EarningsEntry, "direction" | "amount_minor">) {
  const amount = BigInt(entry.amount_minor);
  return {
    sign: entry.direction === "debit" ? "-" : "+",
    minor: (amount < 0n ? -amount : amount).toString(),
  };
}

export function earningsEntriesUrl(cursor?: string) {
  const params = new URLSearchParams({ limit: String(EARNINGS_PAGE_SIZE) });
  if (cursor) params.set("cursor", cursor);
  return `/api/earnings/entries?${params.toString()}`;
}

export function EarningsPanel() {
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [entries, setEntries] = useState<EarningsEntryPage | null>(null);
  const [entryCursors, setEntryCursors] = useState<Array<string | undefined>>([undefined]);
  const [entryPage, setEntryPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [earningSummary, entryPage] = await Promise.all([
        apiFetch<EarningsSummary>("/api/earnings"),
        apiFetch<EarningsEntryPage>(earningsEntriesUrl(cursor)),
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

  const refresh = () => void load(entryCursors[entryPage]);
  const nextPage = () => {
    if (!entries?.nextCursor || loading) return;
    const nextIndex = entryPage + 1;
    setEntryCursors((current) => [...current.slice(0, nextIndex), entries.nextCursor!]);
    setEntryPage(nextIndex);
    void load(entries.nextCursor);
  };
  const previousPage = () => {
    if (entryPage === 0 || loading) return;
    const previousIndex = entryPage - 1;
    setEntryPage(previousIndex);
    void load(entryCursors[previousIndex]);
  };

  const withdrawable = findWithdrawableBalance(summary);
  const pending = summary?.balances.find((balance) => balance.state === "pending") ?? null;

  return (
    <section className="grid gap-4" aria-labelledby="earnings-heading">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Earnings</p>
          <h2 id="earnings-heading">Earnings</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Seller and referral earnings from completed purchases. Pending earnings become available
            only when the settlement process says they are ready.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={refresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {error && (
        <Toast>
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={refresh}>
            Try again
          </Button>
        </Toast>
      )}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-3" aria-label="Loading earnings">
          <Skeleton className="h-44 w-full md:col-span-2" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <EarningsHighlight withdrawable={withdrawable} />
            <Card className="p-5">
              <p className="eyebrow">Pending earnings</p>
              <p className="mt-4 text-3xl font-semibold tracking-tight">
                {pending ? <Money minor={pending.amount_minor} currency={pending.currency} /> : "—"}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Pending until the settlement process makes them available.
              </p>
            </Card>
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
          <EarningsActivity
            entries={entries}
            page={entryPage}
            onNext={nextPage}
            onPrevious={previousPage}
          />
        </>
      )}
    </section>
  );
}

export function EarningsHighlight({
  withdrawable,
}: {
  withdrawable: EarningsSummary["withdrawable_balances"][number] | null;
}) {
  return (
    <Card className="relative overflow-hidden border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-6 shadow-md md:col-span-2">
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-emerald-800">Available earnings</p>
          <p className="mt-1 text-sm font-medium text-slate-600">Ready for withdrawal</p>
        </div>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
          Earned
        </span>
      </div>
      <p className="relative mt-8 text-4xl font-bold tracking-tight text-slate-950">
        {withdrawable ? (
          <Money minor={withdrawable.amount_minor} currency={withdrawable.currency} />
        ) : (
          "—"
        )}
      </p>
      <p className="relative mt-3 max-w-md text-sm leading-relaxed text-slate-600">
        Seller and referral earnings available to request for payout.
      </p>
    </Card>
  );
}

export function EarningsActivity({
  entries,
  page,
  onNext,
  onPrevious,
}: {
  entries: EarningsEntryPage | null;
  page: number;
  onNext: () => void;
  onPrevious: () => void;
}) {
  return (
    <Card className="p-5">
      <h3>Earnings activity</h3>
      {entries?.items.length ? (
        <>
          <div className="grid">
            {entries.items.map((entry) => (
              <EarningRow entry={entry} key={entry.id} />
            ))}
          </div>
          {(page > 0 || entries.nextCursor) && (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onPrevious}
                disabled={page === 0}
              >
                Previous
              </Button>
              <span className="text-sm text-slate-500">Page {page + 1}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onNext}
                disabled={!entries.nextCursor}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          title="No earnings yet"
          description="Qualifying referral commissions will be recorded here as immutable ledger entries."
        />
      )}
    </Card>
  );
}

function EarningRow({ entry }: { entry: EarningsEntry }) {
  const amount = customerEarningAmount(entry);
  const tone = entry.balance_state === "available" ? "success" : "accent";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-200 py-3 last:border-0">
      <div className="grid min-w-0 gap-1">
        <strong>{customerEarningLabel(entry)}</strong>
        <span className="text-xs text-slate-500">
          {label(entry.balance_state)} · {new Date(entry.created_at).toLocaleDateString()}
        </span>
      </div>
      <div className="grid justify-items-end gap-1 whitespace-nowrap">
        <Badge variant={tone === "success" ? "default" : "destructive"}>
          {label(entry.balance_state)}
        </Badge>
        <span className="inline-flex items-baseline gap-0.5">
          {amount.sign}
          <Money minor={amount.minor} currency={entry.currency} />
        </span>
      </div>
    </div>
  );
}
