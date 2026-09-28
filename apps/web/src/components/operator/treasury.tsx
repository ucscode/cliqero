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
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Toast } from "../toast";
import { Money } from "../money";
import { HoneypotField } from "../honeypot-field";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";
import { OperatorPrimaryCell, OperatorStatusCell, OperatorValueCell } from "./ui/data-cells";
import { OperatorMetricCard } from "./ui/metric-card";
import { OperatorFilterField } from "./ui/toolbar";
import { OperatorSection } from "./ui/section";
import { CrudIndex } from "./crud/index-page";
import { useCrudCollection } from "./crud/use-collection";
import type { CrudColumn } from "./crud/table";
import type { OperatorAction } from "./ui/actions-menu";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Treasury data is temporarily unavailable.";
}

export function OperatorTreasuryPage() {
  const [summary, setSummary] = useState<OperatorTreasurySummary | null>(null);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"" | "credit" | "debit">("");
  const [source, setSource] = useState<"" | "automatic" | "manual">("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [entryDirection, setEntryDirection] = useState<"credit" | "debit">("credit");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const collection = useCrudCollection(
    async (
      filters: {
        search: string;
        direction: "" | "credit" | "debit";
        source: "" | "automatic" | "manual";
      },
      cursor,
    ) => {
      const params = new URLSearchParams({ limit: "25" });
      if (filters.search) params.set("search", filters.search);
      if (filters.direction) params.set("direction", filters.direction);
      if (filters.source) params.set("source", filters.source);
      if (cursor) params.set("cursor", cursor);
      const [nextSummary, nextPage] = await Promise.all([
        apiFetch<OperatorTreasurySummary>("/api/operator/treasury"),
        apiFetch<OperatorTreasuryPage>(`/api/operator/treasury/entries?${params}`),
      ]);
      setSummary(nextSummary);
      return { items: nextPage.items, nextCursor: nextPage.nextCursor };
    },
    { search: "", direction: "", source: "" },
  );

  useEffect(() => {
    // Filters are submitted explicitly so a partially edited query never refetches unexpectedly.
    void collection.apply({ search: "", direction: "", source: "" });
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
      await collection.refresh();
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  type Entry = OperatorTreasuryPage["items"][number];
  const columns: readonly CrudColumn<Entry>[] = [
    {
      key: "entry",
      label: "Entry",
      primary: true,
      render: (entry) => (
        <OperatorPrimaryCell title={entry.title} subtitle={entry.note ?? entry.id} />
      ),
    },
    {
      key: "direction",
      label: "Direction",
      render: (entry) => <OperatorStatusCell status={entry.direction} />,
    },
    {
      key: "source",
      label: "Source / actor",
      render: (entry) =>
        entry.source?.kind === "distribution" ? (
          <Link href={`/operator/distributions/${entry.source.id}`}>Distribution</Link>
        ) : entry.actor ? (
          `@${entry.actor.username}`
        ) : (
          "Manual operator entry"
        ),
    },
    {
      key: "created",
      label: "Created",
      render: (entry) => new Date(entry.createdAt).toLocaleString(),
    },
    {
      key: "amount",
      label: "Amount",
      render: (entry) => (
        <OperatorValueCell>
          <Money minor={entry.amountMinor} />
        </OperatorValueCell>
      ),
    },
  ];
  const actions = (entry: Entry): readonly OperatorAction[] =>
    entry.source?.kind === "distribution"
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
        ];
  return (
    <CrudIndex
      eyebrow="Company accounting"
      title="Treasury"
      description="Inspect Cliqero-owned allocations and append-only operator entries. Wallet deposits and user earnings remain separate."
      beforeTable={
        <>
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
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                Loading treasury summary…
              </div>
            )}
          </div>
          <OperatorSection
            title="Record a company entry"
            description="Append-only accounting. Corrections are made with a separate opposite entry."
            surface
          >
            <form className="operator-treasury-form" onSubmit={(event) => void createEntry(event)}>
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
        </>
      }
      filters={
        <>
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
            <Button type="submit" variant="secondary" disabled={collection.loading}>
              Apply filters
            </Button>
            <HoneypotField />
          </div>
        </>
      }
      onFiltersSubmit={(event) => {
        event.preventDefault();
        void collection.apply({ search: search.trim(), direction, source });
      }}
      items={collection.items}
      columns={columns}
      getRowKey={(entry) => entry.id}
      actions={actions}
      actionLabel={(entry) => `Actions for treasury entry ${entry.id}`}
      loading={collection.loading}
      error={collection.error}
      onRetry={() => void collection.retry()}
      emptyTitle="No treasury entries"
      emptyDescription="Append-only entries will appear here."
      pagination={{
        hasPrevious: collection.hasPrevious,
        hasNext: collection.hasNext,
        onPrevious: () => void collection.previous(),
        onNext: () => void collection.next(),
      }}
      sectionTitle="Treasury entries"
      sectionDescription="Immutable ledger history."
    />
  );
}
