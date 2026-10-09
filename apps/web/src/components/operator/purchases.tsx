"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { CrudIndex } from "@/components/crud/index-page";
import { CrudDetail } from "@/components/crud/detail";
import { useCrudCollection } from "@/components/crud/use-collection";
import type { CrudColumn } from "@/components/crud/table";
import { Money } from "@/components/money";
import { Input } from "../ui/input";
import { OperatorFilterField } from "./ui/toolbar";
import { CrudSortSelect } from "@/components/crud/sort-select";
import { Button } from "../ui/button";
import { OperatorPrimaryCell, OperatorStatusCell } from "./ui/data-cells";
import { OperatorSection } from "./ui/section";
import { OperatorErrorState } from "./ui/error-state";
import type { CrudBulkAction } from "@/components/crud/bulk-actions";
import { runOperatorBulkAction } from "@/app/operator/bulk-actions";
import type { Capability } from "@/modules/identity/capabilities";
import { OperatorResourceLink } from "./ui/resource-link";
import { OperatorBulkOutcome, type OperatorBulkOutcomeData } from "./ui/bulk-outcome";
import { useOperatorConfirmation } from "./ui/confirmation";

type Purchase = {
  id: string;
  state: string;
  amount_minor: string;
  currency: string;
  buyer: { id: string; username: string; email: string | null };
  listing: { id: string; title: string };
  payment_reference: string | null;
  provider: string | null;
  provider_transaction_id: string | null;
  checkout_id: string | null;
  checkout_state: string | null;
  created_at: string;
  updated_at: string;
  distribution: { id: string; amount_minor: string; currency: string; completed_at: string } | null;
};
type PurchasePage = { items: Purchase[]; nextCursor: string | null };
type Filters = { buyer: string; listing: string; state: string; sort: string };

function displayState(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function OperatorPurchaseList({
  initialBuyer = "",
  initialListing = "",
  canDelete = false,
  capabilities = [],
}: {
  initialBuyer?: string;
  initialListing?: string;
  canDelete?: boolean;
  capabilities?: readonly Capability[];
}) {
  const confirm = useOperatorConfirmation();
  const [buyer, setBuyer] = useState(initialBuyer);
  const [listing, setListing] = useState(initialListing);
  const [state, setState] = useState("");
  const [sort, setSort] = useState("created:desc");
  const [bulkOutcome, setBulkOutcome] = useState<OperatorBulkOutcomeData | null>(null);
  const collection = useCrudCollection(
    async (filters: Filters, cursor, limit) => {
      const [sortBy, direction] = filters.sort.split(":") as ["created", "asc" | "desc"];
      const query = new URLSearchParams({ limit: String(limit), sort: sortBy, direction });
      if (filters.buyer) query.set("buyer", filters.buyer.trim());
      if (filters.listing) query.set("listing", filters.listing.trim());
      if (filters.state) query.set("state", filters.state);
      if (cursor) query.set("cursor", cursor);
      return apiFetch<PurchasePage>(`/internal/purchases?${query}`);
    },
    { buyer: initialBuyer, listing: initialListing, state: "", sort: "created:desc" },
  );
  const columns: readonly CrudColumn<Purchase>[] = [
    {
      key: "purchase",
      label: "Purchase",
      primary: true,
      render: (item) => <OperatorPrimaryCell title={item.listing.title} subtitle={item.id} />,
    },
    {
      key: "buyer",
      label: "Buyer",
      render: (item) => (
        <OperatorResourceLink
          capabilities={capabilities}
          requiredCapability="accounts.read"
          href={`/operator/users/${item.buyer.id}`}
        >
          @{item.buyer.username}
        </OperatorResourceLink>
      ),
    },
    {
      key: "listing",
      label: "Listing",
      render: (item) => (
        <OperatorResourceLink
          capabilities={capabilities}
          requiredCapability="catalogue.manage"
          href={`/operator/catalogue/${item.listing.id}`}
        >
          {item.listing.title}
        </OperatorResourceLink>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      render: (item) => <Money minor={item.amount_minor} currency={item.currency} />,
    },
    { key: "state", label: "Status", render: (item) => <OperatorStatusCell status={item.state} /> },
    {
      key: "created",
      label: "Created",
      render: (item) => new Date(item.created_at).toLocaleString(),
    },
  ];
  const bulkActions: readonly CrudBulkAction<Purchase>[] = canDelete
    ? [
        {
          value: "delete",
          label: "Delete",
          destructive: true,
          onSelect: async (items) => {
            if (
              !(await confirm({
                title: "Delete purchases?",
                description: `Delete ${items.length} selected purchases?`,
                confirmLabel: "Delete",
                destructive: true,
              }))
            )
              return false;
            const outcome = await runOperatorBulkAction({
              resource: "purchases",
              action: "delete",
              ids: items.map((item) => item.id),
            });
            await collection.retry();
            if (outcome.failed.length) {
              setBulkOutcome({
                resource: "purchases",
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
      capabilities={capabilities}
      eyebrow="Commerce history"
      title="Purchases"
      description="Purchase records and payment evidence."
      filters={
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OperatorFilterField label="Buyer account ID" htmlFor="purchase-buyer">
            <Input
              id="purchase-buyer"
              value={buyer}
              onChange={(event) => setBuyer(event.target.value)}
              placeholder="Account UUID"
            />
          </OperatorFilterField>
          <OperatorFilterField label="Listing ID" htmlFor="purchase-listing">
            <Input
              id="purchase-listing"
              value={listing}
              onChange={(event) => setListing(event.target.value)}
              placeholder="Listing UUID"
            />
          </OperatorFilterField>
          <OperatorFilterField label="Status" htmlFor="purchase-state">
            <select
              id="purchase-state"
              className="h-10 rounded-md border px-3"
              value={state}
              onChange={(event) => setState(event.target.value)}
            >
              <option value="">All statuses</option>
              {["pending", "paid", "completed", "failed", "refunded"].map((item) => (
                <option key={item} value={item}>
                  {displayState(item)}
                </option>
              ))}
            </select>
          </OperatorFilterField>
          <CrudSortSelect
            value={sort}
            onChange={setSort}
            options={[
              { value: "created:desc", label: "Newest", sort: "created", direction: "desc" },
              { value: "created:asc", label: "Oldest", sort: "created", direction: "asc" },
            ]}
          />
        </div>
      }
      onFiltersSubmit={(event) => {
        event.preventDefault();
        return collection.apply({ buyer: buyer.trim(), listing: listing.trim(), state, sort });
      }}
      onFiltersReset={() => {
        setBuyer("");
        setListing("");
        setState("");
        setSort("created:desc");
        return collection.apply({ buyer: "", listing: "", state: "", sort: "created:desc" });
      }}
      filtersDirty={Boolean(buyer || listing || state || sort !== "created:desc")}
      toolbarActions={
        <Button type="submit" variant="action" disabled={collection.loading}>
          Apply
        </Button>
      }
      items={collection.items}
      columns={columns}
      getRowKey={(item) => item.id}
      selection={canDelete ? { labelForItem: (item) => `purchase ${item.id}` } : undefined}
      bulkActions={bulkActions}
      actions={(item) => [
        { type: "link", label: "View", href: `/operator/purchases/${item.id}` },
        ...(canDelete
          ? [
              {
                type: "action" as const,
                label: "Delete",
                destructive: true,
                onSelect: async () => {
                  if (
                    !(await confirm({
                      title: "Delete purchase?",
                      description: "Delete this purchase and its dependent commerce facts?",
                      confirmLabel: "Delete",
                      destructive: true,
                    }))
                  )
                    return;
                  void runOperatorBulkAction({
                    resource: "purchases",
                    action: "delete",
                    ids: [item.id],
                  }).then(async (result) => {
                    if (result.failed.length) throw new Error(result.failed[0]!.message);
                    await collection.retry();
                  });
                },
              },
            ]
          : []),
      ]}
      actionLabel={(item) => `Actions for purchase ${item.id}`}
      loading={collection.loading}
      initialized={collection.initialized}
      error={collection.error}
      onRetry={() => void collection.retry()}
      emptyTitle="No purchases found"
      emptyDescription="Purchases matching these filters will appear here."
      pagination={{
        hasPrevious: collection.hasPrevious,
        hasNext: collection.hasNext,
        onPrevious: () => void collection.previous(),
        onNext: () => void collection.next(),
      }}
      sectionTitle="Purchase records"
      sectionDescription="All authorized purchase history, newest first by default."
      beforeTable={bulkOutcome ? <OperatorBulkOutcome outcome={bulkOutcome} /> : undefined}
    />
  );
}

export function OperatorPurchaseDetail({
  purchaseId,
  capabilities = [],
}: {
  purchaseId: string;
  capabilities?: readonly Capability[];
}) {
  const [purchase, setPurchase] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void apiFetch<any>(`/internal/purchases/${purchaseId}`)
      .then(setPurchase)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Purchase unavailable."))
      .finally(() => setLoading(false));
  }, [purchaseId]);
  if (loading && !purchase)
    return <CrudDetail eyebrow="Commerce history" title="Purchase" loading />;
  if (!purchase)
    return (
      <CrudDetail
        eyebrow="Commerce history"
        title="Purchase unavailable"
        error={{ title: "Purchase unavailable", message: error ?? "This purchase was not found." }}
      />
    );
  return (
    <CrudDetail
      eyebrow="Commerce history"
      title={purchase.listing_snapshot.title}
      description={purchase.id}
      headerActions={<OperatorStatusCell status={purchase.state} />}
      sections={
        <>
          {error && <OperatorErrorState message={error} />}
          <div className="grid gap-4 lg:grid-cols-2">
            <OperatorSection title="Purchase facts" surface>
              <dl className="detail-list">
                <div>
                  <dt>Buyer</dt>
                  <dd>
                    <OperatorResourceLink
                      capabilities={capabilities}
                      requiredCapability="accounts.read"
                      href={`/operator/users/${purchase.buyer.id}`}
                    >
                      @{purchase.buyer.username}
                    </OperatorResourceLink>
                    {purchase.buyer.email && (
                      <small className="block">{purchase.buyer.email}</small>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Listing</dt>
                  <dd>
                    <OperatorResourceLink
                      capabilities={capabilities}
                      requiredCapability="catalogue.manage"
                      href={`/operator/catalogue/${purchase.listing.id}`}
                    >
                      {purchase.listing.title}
                    </OperatorResourceLink>
                    <small className="block">Snapshot: {purchase.listing_snapshot.title}</small>
                  </dd>
                </div>
                <div>
                  <dt>Amount</dt>
                  <dd>
                    <Money minor={purchase.amount_minor} currency={purchase.currency} /> · Canonical{" "}
                    {purchase.canonical_currency} {purchase.canonical_amount_minor} minor units
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{new Date(purchase.created_at).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{new Date(purchase.updated_at).toLocaleString()}</dd>
                </div>
              </dl>
            </OperatorSection>
            <OperatorSection title="Payment and distribution" surface>
              <dl className="detail-list">
                <div>
                  <dt>Checkout</dt>
                  <dd>
                    {purchase.checkout
                      ? `${purchase.checkout.state} · ${purchase.checkout.id}`
                      : "No checkout linked"}
                  </dd>
                </div>
                <div>
                  <dt>Provider</dt>
                  <dd>{purchase.payment?.provider ?? "Wallet / no provider payment"}</dd>
                </div>
                <div>
                  <dt>Provider reference</dt>
                  <dd className="break-all">{purchase.payment?.reference ?? "—"}</dd>
                </div>
                <div>
                  <dt>Provider transaction</dt>
                  <dd className="break-all">{purchase.payment?.provider_transaction_id ?? "—"}</dd>
                </div>
                <div>
                  <dt>Distribution</dt>
                  <dd>
                    {purchase.distribution ? (
                      <>
                        <Link href={`/operator/distributions/${purchase.distribution.id}`}>
                          {purchase.distribution.id}
                        </Link>{" "}
                        · {purchase.distribution.currency} {purchase.distribution.amount_minor}
                      </>
                    ) : (
                      "No distribution recorded"
                    )}
                  </dd>
                </div>
              </dl>
            </OperatorSection>
          </div>
        </>
      }
    />
  );
}
