"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { ApiClientError, apiFetch, type OperatorEarningsPage } from "@/lib/api-client";
import { Money } from "../money";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { OperatorPrimaryCell, OperatorStatusCell, OperatorValueCell } from "./ui/data-cells";
import { OperatorMetricCard } from "./ui/metric-card";
import { OperatorFilterField } from "./ui/toolbar";
import { CrudIndex } from "@/components/crud/index-page";
import { useCrudCollection } from "@/components/crud/use-collection";
import type { CrudColumn } from "@/components/crud/table";
import { CrudSortSelect } from "@/components/crud/sort-select";
import type { CrudBulkAction } from "@/components/crud/bulk-actions";
import { runOperatorBulkAction } from "@/app/operator/bulk-actions";
import { OperatorBulkOutcome, type OperatorBulkOutcomeData } from "./ui/bulk-outcome";
import { useOperatorConfirmation } from "./ui/confirmation";
import { Textarea } from "../ui/textarea";
import { RequiredLabel } from "../ui/label";
import { useToast } from "../toast/provider";

const formatDate = (value: string) => new Date(value).toLocaleString();
const label = (value: string) =>
  value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
type EarningsEntry = OperatorEarningsPage["items"][number];
export type EarningsCorrectionSummary = {
  id: string;
  createdBy: string;
  accountUsername: string;
  sourceEntryId: string;
  purchaseId: string;
  distributionId: string;
  amountMinor: string;
  pendingMinor: string;
  availableMinor: string;
  debtMinor: string;
  reason: string;
  createdByUsername: string;
  correlationId: string;
  createdAt: string;
};

export function EarningsCorrectionSourceSummary({
  accountUsername,
  sourceEntryId,
  purchaseId,
  distributionId,
  correctableAmountMinor,
  onClose,
}: {
  accountUsername: string;
  sourceEntryId: string;
  purchaseId: string | null;
  distributionId: string | null;
  correctableAmountMinor: string;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold">Source-linked correction</h2>
        <p className="text-sm text-slate-600">
          @{accountUsername} · remaining source amount <Money minor={correctableAmountMinor} />
        </p>
        <p className="break-all font-mono text-xs text-slate-500">Source {sourceEntryId}</p>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Any amount not covered by pending or unreserved Earnings becomes account debt. Funding is
          not debited.
        </p>
      </div>
      <div className="flex gap-3 text-sm underline">
        {purchaseId && <Link href={`/operator/purchases/${purchaseId}`}>Purchase</Link>}
        {distributionId && (
          <Link href={`/operator/distributions/${distributionId}`}>Distribution</Link>
        )}
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export function EarningsCorrectionHistory({ items }: { items: EarningsCorrectionSummary[] }) {
  return (
    <div className="grid gap-2 border-t border-slate-200 pt-4">
      <h3 className="font-medium">Recorded corrections</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-600">No corrections recorded for this source.</p>
      ) : (
        items.map((item) => (
          <article key={item.id} className="grid gap-1 rounded-lg bg-slate-50 p-3 text-sm">
            <p>
              <Link className="font-semibold underline" href={`/operator/users/${item.createdBy}`}>
                @{item.createdByUsername}
              </Link>{" "}
              · {formatDate(item.createdAt)} · <Money minor={item.amountMinor} />
            </p>
            <p>
              Pending offset <Money minor={item.pendingMinor} /> · Available recovered{" "}
              <Money minor={item.availableMinor} /> · Earnings debt <Money minor={item.debtMinor} />
            </p>
            <p>{item.reason}</p>
            <p className="break-all font-mono text-xs text-slate-500">
              Correction {item.id} · Correlation {item.correlationId}
            </p>
          </article>
        ))
      )}
    </div>
  );
}

export function OperatorEarningsList({
  canDelete = false,
  canManage = false,
  canReadCorrections = false,
}: {
  canDelete?: boolean;
  canManage?: boolean;
  canReadCorrections?: boolean;
}) {
  const confirm = useOperatorConfirmation();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [sortChoice, setSortChoice] = useState("created:desc");
  const [sort, direction] = sortChoice.split(":") as ["created" | "amount", "asc" | "desc"];
  const [totals, setTotals] = useState<OperatorEarningsPage["totals"] | null>(null);
  const [bulkOutcome, setBulkOutcome] = useState<OperatorBulkOutcomeData | null>(null);
  const [correctionSource, setCorrectionSource] = useState<EarningsEntry | null>(null);
  const [correctionAmount, setCorrectionAmount] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionHistory, setCorrectionHistory] = useState<EarningsCorrectionSummary[]>([]);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const correctionSubmission = useRef<{ intent: string; key: string } | null>(null);
  const collection = useCrudCollection(
    async (
      filters: { search: string; state: string; sort: string; direction: string },
      cursor,
      pageSize,
    ) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (filters.search) params.set("search", filters.search);
      if (filters.state) params.set("state", filters.state);
      params.set("sort", filters.sort);
      params.set("direction", filters.direction);
      if (cursor) params.set("cursor", cursor);
      const next = await apiFetch<OperatorEarningsPage>(`/api/earnings/entries?${params}`);
      setTotals(next.totals);
      return { items: next.items, nextCursor: next.nextCursor };
    },
    { search: "", state: "", sort: "created", direction: "desc" },
  );

  async function inspectCorrections(entry: EarningsEntry) {
    setCorrectionSource(entry);
    setCorrectionAmount("");
    setCorrectionReason("");
    setCorrectionError(null);
    try {
      const result = await apiFetch<{ items: EarningsCorrectionSummary[] }>(
        `/api/earnings/corrections?source_entry_id=${encodeURIComponent(entry.id)}&limit=50`,
      );
      setCorrectionHistory(result.items);
    } catch (cause) {
      setCorrectionHistory([]);
      setCorrectionError(
        cause instanceof Error ? cause.message : "Earnings correction history is unavailable.",
      );
    }
  }
  async function createCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!correctionSource) return;
    const payload = {
      source_entry_id: correctionSource.id,
      amount_minor: correctionAmount.trim(),
      reason: correctionReason.trim(),
    };
    const intent = JSON.stringify(payload);
    if (!correctionSubmission.current || correctionSubmission.current.intent !== intent)
      correctionSubmission.current = { intent, key: crypto.randomUUID() };
    setCorrectionSaving(true);
    setCorrectionError(null);
    try {
      await apiFetch("/api/earnings/corrections", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": correctionSubmission.current.key,
        },
        body: JSON.stringify(payload),
      });
      correctionSubmission.current = null;
      toast.success("Earnings correction recorded.");
      await collection.retry();
      await inspectCorrections(correctionSource);
    } catch (cause) {
      setCorrectionError(
        cause instanceof ApiClientError
          ? cause.message
          : "The Earnings correction could not be recorded.",
      );
    } finally {
      setCorrectionSaving(false);
    }
  }
  const columns: readonly CrudColumn<EarningsEntry>[] = [
    {
      key: "account",
      label: "Account",
      primary: true,
      render: (entry) => (
        <OperatorPrimaryCell
          title={
            <Link href={`/operator/users/${entry.account.id}`}>@{entry.account.username}</Link>
          }
          subtitle={entry.account.email ?? entry.account.id}
        />
      ),
    },
    {
      key: "source",
      label: "Source",
      render: (entry) => (
        <OperatorPrimaryCell
          title={label(entry.entryType)}
          subtitle={
            entry.level
              ? `Referral level ${entry.level}`
              : entry.purchaseId
                ? `Purchase ${entry.purchaseId}`
                : entry.id
          }
        />
      ),
    },
    {
      key: "state",
      label: "State",
      render: (entry) => <OperatorStatusCell status={entry.balanceState} />,
    },
    { key: "created", label: "Created", render: (entry) => formatDate(entry.createdAt) },
    {
      key: "amount",
      label: "Amount",
      render: (entry) => (
        <OperatorValueCell>
          <Money
            minor={entry.direction === "debit" ? `-${entry.amountMinor}` : entry.amountMinor}
          />
        </OperatorValueCell>
      ),
    },
  ];
  const bulkActions: readonly CrudBulkAction<EarningsEntry>[] = canDelete
    ? [
        {
          value: "delete",
          label: "Delete",
          destructive: true,
          onSelect: async (items) => {
            if (
              !(await confirm({
                title: "Delete earnings entries?",
                description: `Delete ${items.length} selected earnings entries?`,
                confirmLabel: "Delete",
                destructive: true,
              }))
            )
              return false;
            const outcome = await runOperatorBulkAction({
              resource: "earnings",
              action: "delete",
              ids: items.map((item) => item.id),
            });
            await collection.retry();
            if (outcome.failed.length) {
              setBulkOutcome({
                resource: "earnings entries",
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
      eyebrow="Ledger inspection"
      title="User earnings"
      description="Recorded referral commission facts, separated from buyer wallet funds. Reads never settle or mutate entries."
      headerActions={
        <Link className="text-sm underline" href="/operator/earnings-adjustments">
          Earning adjustments
        </Link>
      }
      beforeTable={
        <>
          {correctionSource && (
            <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <EarningsCorrectionSourceSummary
                accountUsername={correctionSource.account.username}
                sourceEntryId={correctionSource.id}
                purchaseId={correctionSource.purchaseId}
                distributionId={correctionSource.distributionId}
                correctableAmountMinor={correctionSource.correctableAmountMinor}
                onClose={() => setCorrectionSource(null)}
              />
              {canManage && BigInt(correctionSource.correctableAmountMinor) > 0n && (
                <form
                  className="grid gap-3 border-t border-slate-200 pt-4"
                  onSubmit={createCorrection}
                >
                  <div className="grid gap-2">
                    <RequiredLabel htmlFor="earning-correction-amount">
                      Amount (USD minor units)
                    </RequiredLabel>
                    <Input
                      id="earning-correction-amount"
                      inputMode="numeric"
                      pattern="[1-9][0-9]*"
                      value={correctionAmount}
                      onChange={(event) => setCorrectionAmount(event.target.value)}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <RequiredLabel htmlFor="earning-correction-reason">Reason</RequiredLabel>
                    <Textarea
                      id="earning-correction-reason"
                      value={correctionReason}
                      onChange={(event) => setCorrectionReason(event.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Button type="submit" disabled={correctionSaving}>
                      {correctionSaving ? "Recording…" : "Record correction"}
                    </Button>
                  </div>
                </form>
              )}
              {correctionError && (
                <p role="alert" className="text-sm text-rose-700">
                  {correctionError}
                </p>
              )}
              <EarningsCorrectionHistory items={correctionHistory} />
            </section>
          )}
          {totals && (
            <div className="grid gap-3 sm:grid-cols-3">
              <OperatorMetricCard
                label="Pending earnings"
                value={<Money minor={totals.pendingMinor} />}
                detail="Awaiting settlement or maturation."
              />
              <OperatorMetricCard
                label="Available earnings"
                value={<Money minor={totals.availableMinor} />}
                detail="Ledger projection available for withdrawal."
              />
              <OperatorMetricCard
                label="Withdrawal reservations"
                value={<Money minor={totals.reservedMinor} />}
                detail="Active reservations; completed withdrawals are not active."
              />
            </div>
          )}
          {bulkOutcome && <OperatorBulkOutcome outcome={bulkOutcome} />}
        </>
      }
      filters={
        <>
          <OperatorFilterField label="Search account or entry" htmlFor="earnings-search">
            <Input
              id="earnings-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Username, email, purchase, entry"
            />
          </OperatorFilterField>
          <OperatorFilterField label="State" htmlFor="earnings-state">
            <Select
              id="earnings-state"
              value={state}
              onChange={(event) => setState(event.target.value)}
            >
              <option value="">All states</option>
              <option value="pending">Pending</option>
              <option value="available">Available</option>
              <option value="partially_corrected">Partially corrected</option>
              <option value="corrected">Corrected</option>
              <option value="reversed">Reversed</option>
            </Select>
          </OperatorFilterField>
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
          state: "",
          sort: "created",
          direction: "desc",
        });
        if (ok) {
          setSearch("");
          setState("");
          setSortChoice("created:desc");
        }
        return ok;
      }}
      filtersDirty={Boolean(search.trim() || state || sortChoice !== "created:desc")}
      onFiltersSubmit={async (event) => {
        event.preventDefault();
        return collection.apply({ search: search.trim(), state, sort, direction });
      }}
      toolbarActions={
        <Button type="submit" variant="action" disabled={collection.loading}>
          Apply filters
        </Button>
      }
      items={collection.items}
      columns={columns}
      getRowKey={(entry) => entry.id}
      selection={canDelete ? { labelForItem: (entry) => `earning ${entry.id}` } : undefined}
      bulkActions={bulkActions}
      actions={(entry) => [
        { type: "link", label: "View account", href: `/operator/users/${entry.account.id}` },
        ...((canReadCorrections || canManage) &&
        entry.entryType === "purchase-earnings" &&
        entry.direction === "credit"
          ? [
              {
                type: "action" as const,
                label: "Correct / view corrections",
                onSelect: () => inspectCorrections(entry),
              },
            ]
          : []),
        ...(entry.distributionId
          ? [
              {
                type: "link" as const,
                label: "View distribution",
                href: `/operator/distributions/${entry.distributionId}`,
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
                      title: "Delete earnings entry?",
                      description: "Delete this earnings entry?",
                      confirmLabel: "Delete",
                      destructive: true,
                    }))
                  )
                    return;
                  void runOperatorBulkAction({
                    resource: "earnings",
                    action: "delete",
                    ids: [entry.id],
                  }).then(async (result) => {
                    if (result.failed.length) throw new Error(result.failed[0]!.message);
                    await collection.retry();
                  });
                },
              },
            ]
          : []),
      ]}
      actionLabel={(entry) => `Actions for earning ${entry.id}`}
      loading={collection.loading}
      error={collection.error}
      onRetry={() => void collection.retry()}
      emptyTitle="No referral earnings found"
      emptyDescription="Referral commission ledger entries will appear after qualifying distributions."
      pagination={{
        hasPrevious: collection.hasPrevious,
        hasNext: collection.hasNext,
        onPrevious: () => void collection.previous(),
        onNext: () => void collection.next(),
      }}
      sectionTitle="Earnings ledger"
      sectionDescription="Inspect and manage persisted earning records."
    />
  );
}
