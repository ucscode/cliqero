"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
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
import { Alert } from "../ui/alert";
import { Money } from "../money";
import { HoneypotField } from "../honeypot-field";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";
import { OperatorPrimaryCell, OperatorStatusCell, OperatorValueCell } from "./ui/data-cells";
import { OperatorMetricCard } from "./ui/metric-card";
import { OperatorFilterField } from "./ui/toolbar";
import { OperatorSection } from "./ui/section";
import { CrudIndex } from "@/components/crud/index-page";
import { useCrudCollection } from "@/components/crud/use-collection";
import type { CrudColumn } from "@/components/crud/table";
import type { OperatorAction } from "./ui/actions-menu";
import { CrudSortSelect } from "@/components/crud/sort-select";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Treasury data is temporarily unavailable.";
}

export function OperatorTreasuryPage() {
  const [summary, setSummary] = useState<OperatorTreasurySummary | null>(null);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"" | "credit" | "debit">("");
  const [source, setSource] = useState<"" | "automatic" | "manual">("");
  const [sortChoice, setSortChoice] = useState("created:desc");
  const [sort, sort_direction] = sortChoice.split(":") as ["created" | "amount", "asc" | "desc"];
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
        sort: string;
        sort_direction: string;
      },
      cursor,
      pageSize,
    ) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (filters.search) params.set("search", filters.search);
      if (filters.direction) params.set("direction", filters.direction);
      if (filters.source) params.set("source", filters.source);
      params.set("sort", filters.sort);
      params.set("sort_direction", filters.sort_direction);
      if (cursor) params.set("cursor", cursor);
      const [nextSummary, nextPage] = await Promise.all([
        apiFetch<OperatorTreasurySummary>("/api/treasury"),
        apiFetch<OperatorTreasuryPage>(`/api/treasury/entries?${params}`),
      ]);
      setSummary(nextSummary);
      return { items: nextPage.items, nextCursor: nextPage.nextCursor };
    },
    { search: "", direction: "", source: "", sort: "created", sort_direction: "desc" },
  );

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
      await apiFetch<OperatorTreasuryEntry>("/api/treasury/entries", {
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
            <form
              className="grid gap-5 sm:grid-cols-2"
              onSubmit={(event) => void createEntry(event)}
            >
              <label className="grid content-start gap-1.5 text-sm font-medium text-slate-700">
                Direction
                <Select
                  value={entryDirection}
                  onChange={(event) => setEntryDirection(event.target.value as "credit" | "debit")}
                >
                  <option value="credit">Credit</option>
                  <option value="debit">Debit</option>
                </Select>
              </label>
              <label className="grid content-start gap-1.5 text-sm font-medium text-slate-700">
                Amount (USD)
                <Input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                  aria-describedby="treasury-amount-help"
                />
                <span
                  id="treasury-amount-help"
                  className="text-xs font-normal leading-5 text-slate-500"
                >
                  Exact cents are recorded; enter dollars such as 10.00.
                </span>
              </label>
              <label className="grid content-start gap-1.5 text-sm font-medium text-slate-700">
                Title
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                />
              </label>
              <label className="grid content-start gap-1.5 text-sm font-medium text-slate-700">
                Note (optional)
                <Input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={1000}
                />
              </label>
              <div className="flex flex-wrap items-center gap-3 pt-1 sm:col-span-2">
                {formError && (
                  <div className="basis-full">
                    <Alert>{formError}</Alert>
                  </div>
                )}
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Add treasury entry"}
                </Button>
                <HoneypotField />
              </div>
            </form>
          </OperatorSection>
        </>
      }
      filters={
        <>
          <OperatorFilterField label="Search" htmlFor="treasury-search">
            <Input
              id="treasury-search"
              type="search"
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
            <Button type="submit" variant="action" disabled={collection.loading}>
              Apply filters
            </Button>
            <HoneypotField />
          </div>
        </>
      }
      sort={
        <CrudSortSelect
          value={sortChoice}
          onChange={setSortChoice}
          options={[
            { value: "created:desc", label: "Newest", sort: "created", direction: "desc" },
            { value: "created:asc", label: "Oldest", sort: "created", direction: "asc" },
            { value: "amount:desc", label: "Highest amount", sort: "amount", direction: "desc" },
            { value: "amount:asc", label: "Lowest amount", sort: "amount", direction: "asc" },
          ]}
        />
      }
      onFiltersReset={async () => {
        const ok = await collection.apply({
          search: "",
          direction: "",
          source: "",
          sort: "created",
          sort_direction: "desc",
        });
        if (ok) {
          setSearch("");
          setDirection("");
          setSource("");
          setSortChoice("created:desc");
        }
        return ok;
      }}
      filtersDirty={Boolean(search.trim() || direction || source || sortChoice !== "created:desc")}
      onFiltersSubmit={async (event) => {
        event.preventDefault();
        return collection.apply({ search: search.trim(), direction, source, sort, sort_direction });
      }}
      items={collection.items}
      columns={columns}
      getRowKey={(entry) => entry.id}
      selection={{ labelForItem: (entry) => `treasury entry ${entry.id}` }}
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
