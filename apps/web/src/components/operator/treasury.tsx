"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  apiFetch,
  formatMinorUsd,
  parseUsdMinor,
  type OperatorTreasuryEntry,
  type OperatorTreasuryPage,
  type OperatorTreasurySummary,
} from "@/lib/api-client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Toast } from "../toast";
import { Money } from "../money";
import { HoneypotField } from "../honeypot-field";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { CursorHistory } from "./ui/cursor-history";
import { OperatorActionsMenu } from "./ui/actions-menu";
import {
  OperatorActionCell,
  OperatorPrimaryCell,
  OperatorStatusCell,
  OperatorValueCell,
} from "./ui/data-cells";
import { OperatorEmptyState } from "./ui/empty-state";
import { OperatorErrorState } from "./ui/error-state";
import { OperatorLoadingState } from "./ui/loading-state";
import { OperatorMetricCard } from "./ui/metric-card";
import { OperatorPage, OperatorPageHeader } from "./ui/page";
import { OperatorPagination } from "./ui/pagination";
import { OperatorSection } from "./ui/section";
import { OperatorTableSurface } from "./ui/table-surface";
import { OperatorFilterField, OperatorToolbar } from "./ui/toolbar";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Treasury data is temporarily unavailable.";
}

export function OperatorTreasuryPage() {
  const [summary, setSummary] = useState<OperatorTreasurySummary | null>(null);
  const [page, setPage] = useState<OperatorTreasuryPage | null>(null);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"" | "credit" | "debit">("");
  const [source, setSource] = useState<"" | "automatic" | "manual">("");
  const [history, setHistory] = useState(() => CursorHistory.firstPage());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [entryDirection, setEntryDirection] = useState<"credit" | "debit">("credit");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const retryCursor = useRef<string | null>(null);
  const busy = useRef(false);

  async function load(cursor: string | null = null) {
    if (busy.current) return false;
    busy.current = true;
    retryCursor.current = cursor;
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
      setPage(nextPage);
      if (!cursor) setHistory(CursorHistory.firstPage());
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  async function nextPage() {
    const cursor = page?.nextCursor;
    if (cursor && !loading && (await load(cursor))) setHistory((value) => value.afterNext(cursor));
  }
  async function previousPage() {
    if (history.hasPrevious && !loading && (await load(history.previous)))
      setHistory((value) => value.afterPrevious());
  }

  useEffect(() => {
    // Filters are submitted explicitly so a partially edited query never refetches unexpectedly.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const honeypot = String(new FormData(event.currentTarget).get(HONEYPOT_FIELD_NAME) ?? "");
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
          ...(honeypot ? { [HONEYPOT_HEADER_NAME]: honeypot } : {}),
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
    <OperatorPage>
      <OperatorPageHeader
        eyebrow="Company accounting"
        title="Treasury"
        description="Inspect Cliqero-owned allocations and append-only operator entries. Wallet deposits and user earnings remain separate."
      />
      {error && <OperatorErrorState message={error} retry={() => void load(retryCursor.current)} />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summary ? (
          <>
            <OperatorMetricCard
              label="Current treasury balance"
              category="USD"
              value={formatMinorUsd(summary.balanceMinor)}
            />
            <OperatorMetricCard
              label="Total credits"
              category="USD"
              value={formatMinorUsd(summary.creditsMinor)}
            />
            <OperatorMetricCard
              label="Total debits"
              category="USD"
              value={formatMinorUsd(summary.debitsMinor)}
            />
          </>
        ) : (
          <OperatorLoadingState variant="section" label="Loading treasury summary" />
        )}
      </div>
      <OperatorSection
        title="Record a company entry"
        description="Append-only accounting. Corrections are made with a separate opposite entry."
        surface
      >
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
          <HoneypotField />
        </form>
      </OperatorSection>
      <OperatorSection title="Treasury entries" description="Immutable ledger history.">
        <OperatorToolbar
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <OperatorFilterField label="Search" htmlFor="treasury-search">
            <Input
              id="treasury-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Title, note, source ID"
            />
          </OperatorFilterField>
          <OperatorFilterField label="Direction" htmlFor="treasury-direction">
            <Select
              id="treasury-direction"
              value={direction}
              onChange={(event) => setDirection(event.target.value as typeof direction)}
            >
              <option value="">All directions</option>
              <option value="credit">Credits</option>
              <option value="debit">Debits</option>
            </Select>
          </OperatorFilterField>
          <OperatorFilterField label="Source" htmlFor="treasury-source">
            <Select
              id="treasury-source"
              value={source}
              onChange={(event) => setSource(event.target.value as typeof source)}
            >
              <option value="">All sources</option>
              <option value="automatic">Automatic platform allocations</option>
              <option value="manual">Manual operator entries</option>
            </Select>
          </OperatorFilterField>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="secondary" disabled={loading}>
              Apply filters
            </Button>
            <HoneypotField />
          </div>
        </OperatorToolbar>
        {loading && !page ? (
          <OperatorLoadingState variant="table" columns={6} label="Loading treasury entries" />
        ) : page?.items.length ? (
          <OperatorTableSurface
            footer={
              <OperatorPagination
                hasPrevious={history.hasPrevious && !loading}
                hasNext={Boolean(page.nextCursor) && !loading}
                onPrevious={() => void previousPage()}
                onNext={() => void nextPage()}
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entry</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Source / actor</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <OperatorPrimaryCell title={entry.title} subtitle={entry.note ?? entry.id} />
                    </TableCell>
                    <TableCell>
                      <OperatorStatusCell status={entry.direction} />
                    </TableCell>
                    <TableCell>
                      {entry.source?.kind === "distribution" && entry.source ? (
                        <Link href={`/operator/distributions/${entry.source.id}`}>
                          Distribution
                        </Link>
                      ) : entry.actor ? (
                        `@${entry.actor.username}`
                      ) : (
                        "Manual operator entry"
                      )}
                    </TableCell>
                    <TableCell>{new Date(entry.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <OperatorValueCell>
                        <Money minor={entry.amountMinor} />
                      </OperatorValueCell>
                    </TableCell>
                    <TableCell>
                      <OperatorActionCell>
                        <OperatorActionsMenu
                          actions={
                            entry.source?.kind === "distribution" && entry.source
                              ? [
                                  {
                                    type: "link",
                                    label: "View distribution",
                                    href: `/operator/distributions/${entry.source.id}`,
                                  },
                                ]
                              : [
                                  {
                                    type: "action",
                                    label: "Immutable ledger entry",
                                    disabled: true,
                                    onSelect: () => undefined,
                                  },
                                ]
                          }
                          label={`Actions for treasury entry ${entry.id}`}
                        />
                      </OperatorActionCell>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </OperatorTableSurface>
        ) : (
          <OperatorEmptyState
            title="No treasury entries"
            description="Append-only entries will appear here."
          />
        )}
      </OperatorSection>
    </OperatorPage>
  );
}
