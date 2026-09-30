"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  apiFetch,
  type OperatorDistributionDetail as DistributionDetail,
  type OperatorDistributionPage,
} from "@/lib/api-client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Money } from "../money";
import { OperatorPrimaryCell, OperatorStatusCell, OperatorValueCell } from "./ui/data-cells";
import { OperatorFilterField } from "./ui/toolbar";
import { CrudIndex } from "@/components/crud/index-page";
import { CrudDetail } from "@/components/crud/detail";
import { useCrudCollection } from "@/components/crud/use-collection";
import type { CrudColumn } from "@/components/crud/table";
import type { OperatorAction } from "./ui/actions-menu";
import { OperatorErrorState } from "./ui/error-state";
import { OperatorSection } from "./ui/section";
import { OperatorEmptyState } from "./ui/empty-state";
import { CrudSortSelect } from "@/components/crud/sort-select";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Distribution data is temporarily unavailable.";
}
function stateLabel(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function OperatorDistributionList() {
  const [search, setSearch] = useState("");
  const [sortChoice, setSortChoice] = useState("created:desc");
  const [sort, direction] = sortChoice.split(":") as ["created" | "amount", "asc" | "desc"];
  const collection = useCrudCollection(
    async (filters: { search: string; sort: string; direction: string }, cursor, pageSize) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (filters.search) params.set("search", filters.search);
      params.set("sort", filters.sort);
      params.set("direction", filters.direction);
      if (cursor) params.set("cursor", cursor);
      const result = await apiFetch<OperatorDistributionPage>(`/api/distributions?${params}`);
      return { items: result.items, nextCursor: result.nextCursor };
    },
    { search: "", sort: "created", direction: "desc" },
  );
  const columns: readonly CrudColumn<OperatorDistributionPage["items"][number]>[] = [
    {
      key: "listing",
      label: "Listing / purchase",
      primary: true,
      render: (item) => (
        <OperatorPrimaryCell title={item.listingTitle} subtitle={`Purchase ${item.purchaseId}`} />
      ),
    },
    {
      key: "buyer",
      label: "Buyer",
      render: (item) => (
        <Link href={`/operator/users/${item.buyer.id}`}>@{item.buyer.username}</Link>
      ),
    },
    { key: "beneficiaries", label: "Beneficiaries", render: (item) => item.beneficiaryCount },
    { key: "state", label: "State", render: () => <OperatorStatusCell status="completed" /> },
    {
      key: "gross",
      label: "Gross",
      render: (item) => (
        <OperatorValueCell>
          <Money minor={item.grossAmountMinor} />
        </OperatorValueCell>
      ),
    },
  ];
  const actions = (item: OperatorDistributionPage["items"][number]): readonly OperatorAction[] => [
    { type: "link", label: "Inspect distribution", href: `/operator/distributions/${item.id}` },
    { type: "link", label: "View buyer", href: `/operator/users/${item.buyer.id}` },
  ];
  return (
    <CrudIndex
      eyebrow="Accounting inspection"
      title="Distributions"
      description="Read-only purchase distribution facts: actual referral commissions and the platform remainder. Historical records are never recalculated here."
      filters={
        <OperatorFilterField label="Search distributions" htmlFor="distribution-search">
          <Input
            id="distribution-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Distribution, purchase, buyer, or listing"
          />
        </OperatorFilterField>
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
      onFiltersSubmit={async (event) => {
        event.preventDefault();
        return collection.apply({ search: search.trim(), sort, direction });
      }}
      onFiltersReset={async () => {
        const ok = await collection.apply({ search: "", sort: "created", direction: "desc" });
        if (ok) {
          setSearch("");
          setSortChoice("created:desc");
        }
        return ok;
      }}
      filtersDirty={Boolean(search.trim() || sortChoice !== "created:desc")}
      toolbarActions={
        <Button type="submit" variant="action" disabled={collection.loading}>
          Apply
        </Button>
      }
      items={collection.items}
      columns={columns}
      getRowKey={(item) => item.id}
      selection={{ labelForItem: (item) => `distribution ${item.id}` }}
      actions={actions}
      actionLabel={(item) => `Actions for distribution ${item.id}`}
      loading={collection.loading}
      error={collection.error}
      onRetry={() => void collection.retry()}
      emptyTitle="No distributions found"
      emptyDescription="Completed purchase distributions will appear here when the worker records them."
      pagination={{
        hasPrevious: collection.hasPrevious,
        hasNext: collection.hasNext,
        onPrevious: () => void collection.previous(),
        onNext: () => void collection.next(),
      }}
      sectionTitle="Distribution ledger"
      sectionDescription="Financial history is immutable; use inspection to review its persisted facts."
    />
  );
}

export function OperatorDistributionDetail({ distributionId }: { distributionId: string }) {
  const [distribution, setDistribution] = useState<DistributionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // Detail reconstructs from persisted distribution, purchase, ledger and settlement facts.
    void apiFetch<DistributionDetail>(`/api/distributions/${distributionId}`)
      .then(setDistribution)
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, [distributionId]);
  if (loading && !distribution)
    return <CrudDetail eyebrow="Distribution fact" title="Distribution" loading />;
  if (!distribution)
    return (
      <CrudDetail
        eyebrow="Distribution fact"
        title="Distribution unavailable"
        error={{
          title: "Distribution unavailable",
          message: error || "This distribution was not found.",
        }}
      />
    );
  return (
    <CrudDetail
      eyebrow="Distribution fact"
      title={distribution.listingTitle}
      description={distribution.id}
      headerActions={<OperatorStatusCell status="completed" />}
      sections={
        <>
          {error && <OperatorErrorState message={error} />}
          <div className="grid gap-4 lg:grid-cols-2">
            <OperatorSection title="Purchase" surface>
              <dl className="detail-list">
                <div>
                  <dt>Listing</dt>
                  <dd>
                    <Link href={`/operator/catalogue/${distribution.listingId}`}>
                      {distribution.listingTitle}
                    </Link>
                    <br />
                    <small className="break-value">{distribution.listingId}</small>
                  </dd>
                </div>
                <div>
                  <dt>Buyer</dt>
                  <dd>
                    <Link href={`/operator/users/${distribution.buyer.id}`}>
                      @{distribution.buyer.username}
                    </Link>
                    <br />
                    <small className="break-value">
                      {distribution.buyer.email ?? "No authentication email"}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Purchase state</dt>
                  <dd>{stateLabel(distribution.purchaseState)}</dd>
                </div>
                <div>
                  <dt>Purchased</dt>
                  <dd>{formatDate(distribution.purchaseCreatedAt)}</dd>
                </div>
                <div>
                  <dt>Gross amount</dt>
                  <dd>
                    <Money minor={distribution.grossAmountMinor} />
                  </dd>
                </div>
              </dl>
            </OperatorSection>
            <OperatorSection title="Platform allocation" surface>
              <dl className="detail-list">
                <div>
                  <dt>Referral commissions</dt>
                  <dd>
                    <Money minor={distribution.referralAllocatedMinor} />
                  </dd>
                </div>
                <div>
                  <dt>Platform remainder</dt>
                  <dd>
                    <Money minor={distribution.platformRemainderMinor} />
                  </dd>
                </div>
                <div>
                  <dt>Completed</dt>
                  <dd>{formatDate(distribution.completedAt)}</dd>
                </div>
                <div>
                  <dt>Beneficiaries</dt>
                  <dd>{distribution.beneficiaryCount}</dd>
                </div>
              </dl>
              <p className="panel-note">
                The remainder includes missing-upline and integer-cent residue according to the
                persisted distribution facts.
              </p>
            </OperatorSection>
          </div>
          <OperatorSection title="Referral attribution" surface>
            {distribution.attribution.referrer ? (
              <p className="panel-intro">
                Promoted by{" "}
                <Link href={`/operator/users/${distribution.attribution.referrer.id}`}>
                  @{distribution.attribution.referrer.username}
                </Link>{" "}
              </p>
            ) : (
              <p className="panel-intro">No referral attribution was recorded for this purchase.</p>
            )}
          </OperatorSection>
          <OperatorSection title="Applied commission policy snapshot" surface>
            <pre className="operator-json-value">
              {JSON.stringify(distribution.policySnapshot, null, 2)}
            </pre>
          </OperatorSection>
          <OperatorSection title="Actual referral allocations" surface>
            {distribution.allocations.length ? (
              <div className="operator-distribution-allocation-list">
                {distribution.allocations.map((allocation) => (
                  <div className="operator-distribution-allocation" key={allocation.id}>
                    <div>
                      <strong>
                        <Link href={`/operator/users/${allocation.account.id}`}>
                          @{allocation.account.username}
                        </Link>
                      </strong>
                      <span>
                        Level {allocation.level ?? "—"} · {stateLabel(allocation.entryType)} ·{" "}
                        {formatDate(allocation.createdAt)}
                      </span>
                    </div>
                    <div>
                      <OperatorStatusCell
                        status={allocation.balanceState}
                        label={stateLabel(allocation.balanceState)}
                      />
                      <Money
                        minor={
                          allocation.direction === "debit"
                            ? `-${allocation.amountMinor}`
                            : allocation.amountMinor
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <OperatorEmptyState
                title="No referral commissions"
                description="This distribution is valid with no qualifying referral commission allocations."
              />
            )}
            {distribution.reversal && (
              <p className="panel-note">
                Reversal {distribution.reversal.state}: {distribution.reversal.reason}
              </p>
            )}
          </OperatorSection>
          <Button asChild variant="secondary">
            <Link href="/operator/distributions">Back to distributions</Link>
          </Button>
        </>
      }
    />
  );
}
