"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  apiFetch,
  formatMinorUsd,
  type OperatorTreasuryEntry,
  type OperatorTreasuryPage,
  type OperatorTreasurySummary,
} from "@/lib/api-client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Money } from "../money";
import { HoneypotField } from "../honeypot-field";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";
import { OperatorPrimaryCell, OperatorStatusCell, OperatorValueCell } from "./ui/data-cells";
import { OperatorMetricCard } from "./ui/metric-card";
import { OperatorFilterField } from "./ui/toolbar";
import { CrudIndex } from "@/components/crud/index-page";
import { useCrudCollection } from "@/components/crud/use-collection";
import type { CrudColumn } from "@/components/crud/table";
import type { OperatorAction } from "./ui/actions-menu";
import { CrudSortSelect } from "@/components/crud/sort-select";
import type { CrudBulkAction } from "@/components/crud/bulk-actions";
import { runOperatorBulkAction } from "@/app/operator/bulk-actions";
import { OperatorBulkOutcome, type OperatorBulkOutcomeData } from "./ui/bulk-outcome";
import { Textarea } from "../ui/textarea";
import { RequiredLabel } from "../ui/label";
import { useOperatorConfirmation } from "./ui/confirmation";
import { useToast } from "../toast/provider";
import { CrudEdit } from "@/components/crud/edit";

function signedUsdMinor(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error("Enter a USD amount with no more than two decimal places.");
  const minor = BigInt(match[2]!) * 100n + BigInt((match[3] ?? "").padEnd(2, "0") || "0");
  const signed = match[1] === "-" ? -minor : minor;
  if (signed === 0n) throw new Error("Adjustment amount must be non-zero.");
  return signed.toString();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Treasury data is temporarily unavailable.";
}

export function OperatorTreasuryForm() {
  const router = useRouter();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");

  async function createEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const honeypot = String(new FormData(event.currentTarget).get(HONEYPOT_FIELD_NAME) ?? "");
    setFormError(null);
    let amountMinor: string;
    try {
      amountMinor = signedUsdMinor(amount);
    } catch (cause) {
      setFormError(errorMessage(cause));
      return;
    }
    if (!reason.trim()) {
      setFormError("Enter a reason for this treasury adjustment.");
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
          amount_minor: amountMinor,
          reason,
          reference: reference || undefined,
        }),
      });
      toast.success("Treasury adjustment recorded.");
      router.push("/operator/treasury");
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <CrudEdit
      mode="create"
      eyebrow="Company accounting"
      title="Treasury adjustment"
      description="Record a signed correction. The ledger derives direction and title from the amount; normal Treasury facts remain domain-generated."
      backHref="/operator/treasury"
      backLabel="Back to Treasury"
      saving={saving}
      onSubmit={(event) => void createEntry(event)}
      error={formError}
      submitLabel="Record adjustment"
      savingLabel="Recording…"
      sectionTitle="Adjustment details"
      widthClassName="max-w-3xl"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid content-start gap-1.5 text-sm font-medium text-slate-700">
          <RequiredLabel htmlFor="treasury-adjustment-amount">Signed amount (USD)</RequiredLabel>
          <Input
            id="treasury-adjustment-amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            required
            aria-describedby="treasury-amount-help"
          />
          <span id="treasury-amount-help" className="text-xs font-normal leading-5 text-slate-500">
            Positive values credit Treasury; negative values debit it. Exact cents are recorded.
          </span>
        </div>
        <div className="grid content-start gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
          <RequiredLabel htmlFor="treasury-adjustment-reason">Reason</RequiredLabel>
          <Textarea
            id="treasury-adjustment-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
            required
          />
        </div>
        <label className="grid content-start gap-1.5 text-sm font-medium text-slate-700">
          Reference (optional)
          <Input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            maxLength={200}
          />
        </label>
        <div className="sm:col-span-2">
          <HoneypotField />
        </div>
      </div>
    </CrudEdit>
  );
}

export function OperatorTreasuryPage({ canDelete = false }: { canDelete?: boolean }) {
  const confirm = useOperatorConfirmation();
  const [summary, setSummary] = useState<OperatorTreasurySummary | null>(null);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"" | "credit" | "debit">("");
  const [source, setSource] = useState<"" | "automatic" | "adjustment">("");
  const [sortChoice, setSortChoice] = useState("created:desc");
  const [sort, sort_direction] = sortChoice.split(":") as ["created" | "amount", "asc" | "desc"];
  const [bulkOutcome, setBulkOutcome] = useState<OperatorBulkOutcomeData | null>(null);
  const collection = useCrudCollection(
    async (
      filters: {
        search: string;
        direction: "" | "credit" | "debit";
        source: "" | "automatic" | "adjustment";
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

  type Entry = OperatorTreasuryPage["items"][number];
  const columns: readonly CrudColumn<Entry>[] = [
    {
      key: "entry",
      label: "Entry",
      primary: true,
      render: (entry) => <OperatorPrimaryCell title={entry.title} subtitle={entry.note ?? "—"} />,
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
        ) : entry.source?.kind === "withdrawal_fee" ||
          entry.source?.kind === "withdrawal_fee_reversal" ? (
          <Link href={`/operator/withdrawals/${entry.source.id}`}>Withdrawal</Link>
        ) : entry.source?.kind === "wallet_transfer" ? (
          <span>Wallet transfer</span>
        ) : entry.source?.kind === "treasury_adjustment" ? (
          <span>Adjustment</span>
        ) : entry.source ? (
          <span>{entry.source.kind.replaceAll("_", " ")}</span>
        ) : entry.actor ? (
          `@${entry.actor.username}`
        ) : (
          "Legacy entry"
        ),
    },
    {
      key: "correlation",
      label: "Correlation",
      render: (entry) => <span className="break-all">{entry.correlationId ?? "—"}</span>,
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
  const actions = (entry: Entry): readonly OperatorAction[] => [
    ...(entry.source?.kind === "distribution"
      ? [
          {
            type: "link" as const,
            label: "View distribution",
            href: `/operator/distributions/${entry.source.id}`,
          },
        ]
      : []),
    ...(canDelete
      ? [
          {
            type: "action" as const,
            label: "Delete",
            destructive: true,
            onSelect: async () => {
              if (
                !(await confirm({
                  title: "Delete Treasury entry?",
                  description:
                    "This permanently removes the selected ledger fact and preserves an audit snapshot.",
                  confirmLabel: "Delete",
                  destructive: true,
                }))
              )
                return;
              const result = await runOperatorBulkAction({
                resource: "treasury",
                action: "delete",
                ids: [entry.id],
              });
              if (result.failed.length) throw new Error(result.failed[0]!.message);
              await collection.retry();
            },
          },
        ]
      : []),
  ];
  const bulkActions: readonly CrudBulkAction<Entry>[] = canDelete
    ? [
        {
          value: "delete",
          label: "Delete",
          destructive: true,
          onSelect: async (items) => {
            if (
              !(await confirm({
                title: `Delete ${items.length} Treasury entries?`,
                description:
                  "This permanently removes the selected ledger facts and preserves audit snapshots.",
                confirmLabel: "Delete",
                destructive: true,
              }))
            )
              return false;
            const outcome = await runOperatorBulkAction({
              resource: "treasury",
              action: "delete",
              ids: items.map((item) => item.id),
            });
            await collection.retry();
            if (outcome.failed.length) {
              setBulkOutcome({
                resource: "treasury entries",
                selectedCount: items.length,
                failures: outcome.failed.map(({ id, message }) => ({ id, message })),
              });
              return false;
            }
            setBulkOutcome(null);
            return true;
          },
        },
      ]
    : [];
  return (
    <CrudIndex
      eyebrow="Company accounting"
      title="Treasury"
      description="Inspect deterministic company ledger facts and authorized signed adjustments. Wallet deposits and user earnings remain separate."
      createAction={{ label: "New adjustment", href: "/operator/treasury/new" }}
      beforeTable={
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
              <option value="automatic">System-generated</option>
              <option value="adjustment">Adjustments</option>
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
      selection={canDelete ? { labelForItem: (entry) => `treasury entry ${entry.id}` } : undefined}
      bulkActions={bulkActions}
      actions={actions}
      actionLabel={(entry) => `Actions for treasury entry ${entry.id}`}
      loading={collection.loading}
      error={collection.error}
      onRetry={() => void collection.retry()}
      emptyTitle="No treasury entries"
      emptyDescription="Treasury entries will appear here."
      pagination={{
        hasPrevious: collection.hasPrevious,
        hasNext: collection.hasNext,
        onPrevious: () => void collection.previous(),
        onNext: () => void collection.next(),
      }}
      sectionTitle="Treasury entries"
      sectionDescription="Treasury history and current allocations."
      afterTable={bulkOutcome ? <OperatorBulkOutcome outcome={bulkOutcome} /> : undefined}
    />
  );
}
