"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, type OperatorEarningsEntry, type OperatorEarningsPage } from "@/lib/api-client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";
import { Money } from "./money";

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
function label(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Earnings data is temporarily unavailable.";
}

export function OperatorEarningsList() {
  const [page, setPage] = useState<OperatorEarningsPage | null>(null);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  async function load(cursor?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "25" });
      if (search.trim()) params.set("search", search.trim());
      if (state) params.set("state", state);
      if (cursor) params.set("cursor", cursor);
      setPage(await apiFetch<OperatorEarningsPage>(`/api/operator/earnings?${params}`));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    // Initial read is explicit; filters are submitted by the operator.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="operator-earnings-page">
      <div className="operator-heading">
        <div>
          <p className="eyebrow">Ledger inspection</p>
          <h2>User earnings</h2>
          <p className="panel-intro">
            Append-only referral commission facts, separated from buyer wallet funds. Reads never
            settle or mutate entries.
          </p>
        </div>
      </div>
      <div className="operator-earnings-summary-grid">
        <Card>
          <p className="eyebrow">Pending earnings</p>
          <h3>{page ? <Money minor={page.totals.pendingMinor} /> : <Skeleton />}</h3>
          <p className="panel-note">Awaiting settlement/maturation.</p>
        </Card>
        <Card>
          <p className="eyebrow">Available earnings</p>
          <h3>{page ? <Money minor={page.totals.availableMinor} /> : <Skeleton />}</h3>
          <p className="panel-note">Ledger projection available for withdrawal.</p>
        </Card>
        <Card>
          <p className="eyebrow">Withdrawal reservations</p>
          <h3>{page ? <Money minor={page.totals.reservedMinor} /> : <Skeleton />}</h3>
          <p className="panel-note">Active reservations; completed withdrawals are not active.</p>
        </Card>
      </div>
      <Card className="operator-earnings-toolbar">
        <form
          className="operator-earnings-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <label>
            Search account or entry
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Handle, email, account, purchase, entry"
            />
          </label>
          <label>
            State
            <Select value={state} onChange={(event) => setState(event.target.value)}>
              <option value="">All states</option>
              <option value="pending">Pending</option>
              <option value="available">Available</option>
              <option value="reversed">Reversed</option>
            </Select>
          </label>
          <Button type="submit" variant="secondary" disabled={loading}>
            {loading ? "Loading…" : "Apply filters"}
          </Button>
        </form>
      </Card>
      {error && <Toast>{error}</Toast>}
      {loading && !page ? (
        <Card aria-label="Loading earnings">
          <Skeleton className="operator-funding-detail-skeleton" />
        </Card>
      ) : page?.items.length ? (
        <>
          <div className="operator-earnings-list">
            {page.items.map((entry) => (
              <EarningsRow entry={entry} key={entry.id} />
            ))}
          </div>
          {page.nextCursor && (
            <Button
              variant="secondary"
              disabled={loading}
              onClick={() => void load(page.nextCursor)}
            >
              {loading ? "Loading…" : "Next page"}
            </Button>
          )}
        </>
      ) : (
        <Card>
          <EmptyState
            title="No referral earnings found"
            description="Referral commission ledger entries will appear here after qualifying distributions."
          />
        </Card>
      )}
    </div>
  );
}

function EarningsRow({ entry }: { entry: OperatorEarningsEntry }) {
  const signed = entry.direction === "debit" ? `-${entry.amountMinor}` : entry.amountMinor;
  return (
    <Card className="operator-earnings-row">
      <div className="operator-earnings-row-main">
        <div>
          <strong>
            <Link href={`/operator/users/${entry.account.id}`}>@{entry.account.handle}</Link>
          </strong>
          <span>
            {label(entry.entryType)} · {formatDate(entry.createdAt)}
          </span>
          <small className="break-value">Entry {entry.id}</small>
        </div>
        <div className="operator-earnings-row-amount">
          <Badge
            tone={
              entry.balanceState === "available"
                ? "success"
                : entry.balanceState === "reversed"
                  ? "accent"
                  : "neutral"
            }
          >
            {label(entry.balanceState)}
          </Badge>
          <Money minor={signed} />
        </div>
      </div>
      <div className="operator-earnings-row-meta">
        {entry.level ? <span>Referral level {entry.level}</span> : null}
        {entry.purchaseId ? (
          <span>
            Purchase <span className="break-value">{entry.purchaseId}</span>
          </span>
        ) : null}
        {entry.distributionId ? (
          <Link href={`/operator/distributions/${entry.distributionId}`}>View distribution</Link>
        ) : null}
        {entry.settledAt ? <span>Settled {formatDate(entry.settledAt)}</span> : null}
      </div>
    </Card>
  );
}
