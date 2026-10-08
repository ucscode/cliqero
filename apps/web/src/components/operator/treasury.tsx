"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
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
import { CopyValue } from "../copy-value";
import { CrudDetail, type CrudField } from "@/components/crud/detail";

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

export function treasurySourceLabel(source: OperatorTreasuryEntry["source"]) {
  if (!source) return "Source not recorded";
  switch (source.kind) {
    case "distribution":
      return "Purchase distribution";
    case "withdrawal_fee":
      return "Withdrawal fee";
    case "withdrawal_fee_reversal":
      return "Withdrawal fee reversal";
    case "wallet_transfer":
      return "Wallet transfer fee";
    case "wallet_transfer_compensation":
      return "Wallet transfer compensation fee refund";
    case "treasury_adjustment":
      return "Manual Treasury adjustment";
    default:
      return source.kind.replaceAll("_", " ");
  }
}

export function treasurySourceHref(source: OperatorTreasuryEntry["source"]) {
  if (!source) return null;
  if (source.kind === "distribution") return `/operator/distributions/${source.id}`;
  if (source.kind === "withdrawal_fee" || source.kind === "withdrawal_fee_reversal")
    return `/operator/withdrawals/${source.id}`;
  return null;
}

export function OperatorTreasuryTraceability({ entry }: { entry: OperatorTreasuryEntry }) {
  const sourceHref = treasurySourceHref(entry.source);
  const actor = entry.actor;
  return (
    <div className="grid min-w-0 gap-2 text-sm">
      <div className="grid gap-0.5">
        <span className="text-slate-500">Source</span>
        <span className="break-words font-medium text-slate-800">
          {sourceHref && entry.source ? (
            <Link href={sourceHref} className="text-violet-700 hover:underline">
              {treasurySourceLabel(entry.source)}
            </Link>
          ) : (
            treasurySourceLabel(entry.source)
          )}
        </span>
        {entry.source && (
          <code className="break-all text-xs text-slate-500">{entry.source.id}</code>
        )}
      </div>
      <div className="grid gap-0.5">
        <span className="text-slate-500">Actor</span>
        {actor?.kind === "system" ? (
          <span className="font-medium text-slate-700">System / automated</span>
        ) : actor?.id && actor.username ? (
          <span>
            <Link
              href={`/operator/users/${actor.id}`}
              className="font-medium text-violet-700 hover:underline"
            >
              @{actor.username}
            </Link>
            <span className="ml-1 text-xs text-slate-500">
              {actor.kind === "operator"
                ? "Operator"
                : actor.kind === "customer"
                  ? "Customer"
                  : "Attributed account"}
            </span>
          </span>
        ) : (
          <span className="text-slate-500">Actor not recorded (historical)</span>
        )}
      </div>
    </div>
  );
}

export function OperatorTreasuryCorrelation({ correlationId }: { correlationId: string | null }) {
  return correlationId ? (
    <CopyValue label="correlation ID" value={correlationId} />
  ) : (
    <span className="text-slate-500">Not recorded (historical)</span>
  );
}

export function OperatorTreasuryDetail({ entryId }: { entryId: string }) {
  const [entry, setEntry] = useState<OperatorTreasuryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setEntry(await apiFetch<OperatorTreasuryEntry>(`/api/treasury/entries/${entryId}`));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void apiFetch<OperatorTreasuryEntry>(`/api/treasury/entries/${entryId}`)
      .then((value) => {
        if (active) setEntry(value);
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [entryId]);

  if (!entry)
    return (
      <CrudDetail
        eyebrow="Treasury fact"
        title="Treasury entry"
        loading={loading}
        error={
          !loading
            ? {
                title: "Treasury entry unavailable",
                message: error ?? "This Treasury entry was not found.",
                retry: () => void load(),
              }
            : undefined
        }
      />
    );

  const fields: CrudField[] = [
    { label: "Direction", value: entry.direction },
    { label: "Amount", value: <Money minor={entry.amountMinor} /> },
    { label: "Note", value: entry.note ?? "—" },
    {
      label: "Source and actor",
      value: <OperatorTreasuryTraceability entry={entry} />,
      className: "sm:col-span-2",
    },
    {
      label: "Correlation ID",
      value: <OperatorTreasuryCorrelation correlationId={entry.correlationId} />,
      className: "sm:col-span-2",
    },
    { label: "Created", value: new Date(entry.createdAt).toLocaleString() },
  ];

  return (
    <CrudDetail
      eyebrow="Treasury fact"
      title={entry.title}
      description={entry.id}
      headerActions={
        <Link className="text-sm font-medium text-violet-700" href="/operator/treasury">
          Back to Treasury
        </Link>
      }
      fields={fields}
    />
  );
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
      render: (entry) => (
        <OperatorPrimaryCell
          title={
            <Link href={`/operator/treasury/${entry.id}`} className="hover:underline">
              {entry.title}
            </Link>
          }
          subtitle={entry.note ?? "—"}
        />
      ),
    },
    {
      key: "direction",
      label: "Direction",
      render: (entry) => <OperatorStatusCell status={entry.direction} />,
    },
    {
      key: "source",
      label: "Source and actor",
      render: (entry) => <OperatorTreasuryTraceability entry={entry} />,
    },
    {
      key: "correlation",
      label: "Correlation",
      render: (entry) => <OperatorTreasuryCorrelation correlationId={entry.correlationId} />,
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
              placeholder="Title, note, source ID, correlation ID"
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
