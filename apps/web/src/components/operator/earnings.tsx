"use client";

import Link from "next/link";
import { useState } from "react";
import { apiFetch, type OperatorEarningsPage } from "@/lib/api-client";
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

const formatDate = (value: string) => new Date(value).toLocaleString();
const label = (value: string) =>
  value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function OperatorEarningsList({ canDelete = false }: { canDelete?: boolean }) {
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [sortChoice, setSortChoice] = useState("created:desc");
  const [sort, direction] = sortChoice.split(":") as ["created" | "amount", "asc" | "desc"];
  const [totals, setTotals] = useState<OperatorEarningsPage["totals"] | null>(null);
  const [bulkOutcome, setBulkOutcome] = useState<OperatorBulkOutcomeData | null>(null);
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

  type Entry = OperatorEarningsPage["items"][number];
  const columns: readonly CrudColumn<Entry>[] = [
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
  const bulkActions: readonly CrudBulkAction<Entry>[] = canDelete
    ? [
        {
          value: "delete",
          label: "Delete",
          destructive: true,
          onSelect: async (items) => {
            if (!window.confirm(`Delete ${items.length} selected earnings entries?`)) return false;
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
                onSelect: () => {
                  if (!window.confirm("Delete this earnings entry?")) return;
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
