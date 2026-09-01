"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiClientError,
  apiFetch,
  type EarningsEntry,
  type EarningsEntryPage,
  type EarningsSummary,
} from "@/lib/api-client";
import { Badge, Button, Card, EmptyState, Money, Skeleton, Toast } from "./ui";

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
    <section className="earnings-panel" aria-labelledby="earnings-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Earnings</p>
          <h2 id="earnings-heading">Referral earnings</h2>
          <p className="panel-intro">
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
          <button type="button" onClick={() => void load()}>
            Try again
          </button>
        </Toast>
      )}
      {loading ? (
        <div className="earnings-summary-grid" aria-label="Loading earnings">
          <Skeleton className="earnings-skeleton" />
          <Skeleton className="earnings-skeleton" />
        </div>
      ) : (
        <>
          <div className="earnings-summary-grid">
            {(summary?.balances ?? []).length ? (
              summary!.balances.map((balance) => (
                <Card
                  className="earnings-summary-card"
                  key={`${balance.currency}-${balance.state}`}
                >
                  <p className="eyebrow">{label(balance.state)}</p>
                  <h3>
                    <Money minor={balance.amount_minor} currency={balance.currency} />
                  </h3>
                  <p className="panel-note">{balance.currency} ledger projection</p>
                </Card>
              ))
            ) : (
              <Card className="earnings-summary-card">
                <p className="eyebrow">Available</p>
                <h3>
                  <Money minor="0" currency="USD" />
                </h3>
                <p className="panel-note">
                  Your referral earnings will appear after qualifying purchases settle.
                </p>
              </Card>
            )}
          </div>
          <Card className="earnings-history-card">
            <div className="card-kicker">
              <h3>Earnings activity</h3>
              {entries?.items.length ? <Badge tone="accent">{entries.items.length}</Badge> : null}
            </div>
            {entries?.items.length ? (
              <div className="earning-list">
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
    <div className="earning-row">
      <div>
        <strong>{label(entry.entry_type)}</strong>
        <span>
          {label(entry.balance_state)} · {new Date(entry.created_at).toLocaleDateString()}
        </span>
      </div>
      <div className="earning-row-end">
        <Badge tone={tone}>{label(entry.balance_state)}</Badge>
        <Money minor={signedMinor} currency={entry.currency} />
      </div>
      {entry.purchase_id && <small className="earning-context">Purchase {entry.purchase_id}</small>}
    </div>
  );
}
