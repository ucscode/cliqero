"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  apiFetch,
  formatMinorUsd,
  parseUsdMinor,
  type OperatorTreasuryEntry,
  type OperatorTreasuryPage,
  type OperatorTreasurySummary,
} from "@/lib/api-client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";
import { Money } from "./money";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Treasury data is temporarily unavailable.";
}

export function OperatorTreasuryPage() {
  const [summary, setSummary] = useState<OperatorTreasurySummary | null>(null);
  const [page, setPage] = useState<OperatorTreasuryPage | null>(null);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"" | "credit" | "debit">("");
  const [source, setSource] = useState<"" | "automatic" | "manual">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [entryDirection, setEntryDirection] = useState<"credit" | "debit">("credit");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  async function load(cursor?: string | null, append = false) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "25" });
      if (search.trim()) params.set("search", search.trim());
      if (direction) params.set("direction", direction);
      if (source) params.set("source", source);
      if (cursor) params.set("cursor", cursor);
      const [nextSummary, nextPage] = await Promise.all([
        apiFetch<OperatorTreasurySummary>("/api/operator/treasury"),
        apiFetch<OperatorTreasuryPage>(`/api/operator/treasury/entries?${params}`),
      ]);
      setSummary(nextSummary);
      setPage(
        append && page
          ? { items: [...page.items, ...nextPage.items], nextCursor: nextPage.nextCursor }
          : nextPage,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Filters are submitted explicitly so a partially edited query never refetches unexpectedly.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createEntry(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    let amountMinor: string;
    try {
      amountMinor = parseUsdMinor(amount);
    } catch (cause) {
      setFormError(errorMessage(cause));
      return;
    }
    if (!title.trim()) {
      setFormError("Enter a title for this treasury entry.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch<OperatorTreasuryEntry>("/api/operator/treasury/entries", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          direction: entryDirection,
          amount_minor: amountMinor,
          title,
          note: note || undefined,
        }),
      });
      setAmount("");
      setTitle("");
      setNote("");
      await load();
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="operator-treasury-page">
      <div className="operator-heading">
        <div>
          <p className="eyebrow">Company accounting</p>
          <h2 id="operator-treasury-heading">Treasury</h2>
          <p className="panel-intro">
            Inspect Cliqero-owned allocations and append-only operator entries. Wallet deposits and
            user earnings remain separate.
          </p>
        </div>
      </div>
      {error && <Toast>{error}</Toast>}
      <div className="operator-metric-grid operator-treasury-summary">
        {summary ? (
          <>
            <SummaryCard label="Current treasury balance" value={summary.balanceMinor} />
            <SummaryCard label="Total credits" value={summary.creditsMinor} />
            <SummaryCard label="Total debits" value={summary.debitsMinor} />
          </>
        ) : (
          [1, 2, 3].map((item) => (
            <Card className="operator-metric-card" key={item}>
              <Skeleton className="operator-metric-skeleton" />
            </Card>
          ))
        )}
      </div>
      <Card>
        <div className="operator-section-heading">
          <div>
            <p className="eyebrow">Append-only fact</p>
            <h3>Record a company entry</h3>
          </div>
          <p className="panel-intro">Corrections are made with a separate opposite entry.</p>
        </div>
        <form className="operator-treasury-form" onSubmit={createEntry}>
          <label>
            Direction
            <Select
              value={entryDirection}
              onChange={(event) => setEntryDirection(event.target.value as "credit" | "debit")}
            >
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </Select>
          </label>
          <label>
            Amount (USD)
            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              aria-describedby="treasury-amount-help"
            />
            <span id="treasury-amount-help" className="field-help">
              Exact cents are recorded; enter dollars such as 10.00.
            </span>
          </label>
          <label>
            Title
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
            />
          </label>
          <label>
            Note (optional)
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={1000}
            />
          </label>
          {formError && <Toast>{formError}</Toast>}
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Add treasury entry"}
          </Button>
        </form>
      </Card>
      <Card>
        <div className="operator-section-heading">
          <div>
            <p className="eyebrow">Immutable history</p>
            <h3>Treasury entries</h3>
          </div>
        </div>
        <form
          className="operator-treasury-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <label>
            Search
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Title, note, source ID"
            />
          </label>
          <label>
            Direction
            <Select
              value={direction}
              onChange={(event) => setDirection(event.target.value as typeof direction)}
            >
              <option value="">All directions</option>
              <option value="credit">Credits</option>
              <option value="debit">Debits</option>
            </Select>
          </label>
          <label>
            Source
            <Select
              value={source}
              onChange={(event) => setSource(event.target.value as typeof source)}
            >
              <option value="">All sources</option>
              <option value="automatic">Automatic platform allocations</option>
              <option value="manual">Manual operator entries</option>
            </Select>
          </label>
          <Button type="submit" variant="secondary" disabled={loading}>
            Apply filters
          </Button>
        </form>
        {loading && !page ? (
          <Skeleton className="operator-treasury-skeleton" />
        ) : page?.items.length ? (
          <>
            <div className="operator-treasury-list">
              {page.items.map((entry) => (
                <TreasuryRow entry={entry} key={entry.id} />
              ))}
            </div>
            {page.nextCursor && (
              <Button
                variant="secondary"
                onClick={() => void load(page.nextCursor, true)}
                disabled={loading}
              >
                {loading ? "Loading…" : "Next page"}
              </Button>
            )}
          </>
        ) : (
          <EmptyState
            title="No treasury entries"
            description="Append-only entries will appear here."
          />
        )}
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="operator-metric-card">
      <p className="eyebrow">USD</p>
      <p className="operator-metric-value">{formatMinorUsd(value)}</p>
      <p className="operator-metric-label">{label}</p>
    </Card>
  );
}

function TreasuryRow({ entry }: { entry: OperatorTreasuryEntry }) {
  const automatic = entry.source?.kind === "distribution";
  return (
    <article className="operator-treasury-row">
      <div>
        <div className="operator-treasury-row-heading">
          <Badge tone={entry.direction === "credit" ? "success" : "accent"}>
            {entry.direction === "credit" ? "Credit" : "Debit"}
          </Badge>
          <strong>
            <Money minor={entry.amountMinor} />
          </strong>
        </div>
        <h4>{entry.title}</h4>
        {entry.note && <p>{entry.note}</p>}
      </div>
      <div className="operator-treasury-row-meta">
        <span>{new Date(entry.createdAt).toLocaleString()}</span>
        <span>{automatic ? "Automatic platform allocation" : "Manual operator entry"}</span>
        {entry.actor && <span>Actor: @{entry.actor.handle}</span>}
        {automatic && entry.source && (
          <Link href={`/operator/distributions/${entry.source.id}`}>View distribution</Link>
        )}
      </div>
    </article>
  );
}
