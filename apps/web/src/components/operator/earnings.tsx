"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, type OperatorEarningsPage } from "@/lib/api-client";
import { Money } from "../money";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { OperatorPrimaryCell, OperatorStatusCell, OperatorValueCell } from "./ui/data-cells";
import { OperatorMetricCard } from "./ui/metric-card";
import { OperatorFilterField } from "./ui/toolbar";
import { CrudIndex } from "./crud/index-page";
import { useCrudCollection } from "./crud/use-collection";
import type { CrudColumn } from "./crud/table";

const formatDate = (value: string) => new Date(value).toLocaleString();
const label = (value: string) =>
  value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function OperatorEarningsList() {
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [totals, setTotals] = useState<OperatorEarningsPage["totals"] | null>(null);
  const collection = useCrudCollection(
    async (filters: { search: string; state: string }, cursor) => {
      const params = new URLSearchParams({ limit: "25" });
      if (filters.search) params.set("search", filters.search);
      if (filters.state) params.set("state", filters.state);
      if (cursor) params.set("cursor", cursor);
      const next = await apiFetch<OperatorEarningsPage>(`/api/operator/earnings?${params}`);
      setTotals(next.totals);
      return { items: next.items, nextCursor: next.nextCursor };
    },
    { search: "", state: "" },
  );

  useEffect(() => {
    void collection.apply({ search: "", state: "" });
    // Initial load intentionally captures the initial (empty) filters only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <CrudIndex
      eyebrow="Ledger inspection"
      title="User earnings"
      description="Append-only referral commission facts, separated from buyer wallet funds. Reads never settle or mutate entries."
      beforeTable={
        totals && (
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
        )
      }
      filters={
        <>
          <OperatorFilterField label="Search account or entry" htmlFor="earnings-search">
            <Input
              id="earnings-search"
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
      onFiltersSubmit={(event) => {
        event.preventDefault();
        void collection.apply({ search: search.trim(), state });
      }}
      toolbarActions={
        <Button type="submit" variant="secondary" disabled={collection.loading}>
          Apply filters
        </Button>
      }
      items={collection.items}
      columns={columns}
      getRowKey={(entry) => entry.id}
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
      sectionDescription="Persisted financial facts are read-only here."
    />
  );
}
