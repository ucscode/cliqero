"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  apiFetch,
  formatMinorUsd,
  type OperatorWithdrawalDetail as Detail,
  type OperatorWithdrawalPage,
  type OperatorWithdrawalState,
} from "@/lib/api-client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { CopyValue } from "../copy-value";
import { Money } from "../money";
import { OperatorPrimaryCell, OperatorStatusCell, OperatorValueCell } from "./ui/data-cells";
import { OperatorFilterField } from "./ui/toolbar";
import { CrudIndex } from "./crud/index-page";
import { CrudDetail } from "./crud/detail";
import { useCrudCollection } from "./crud/use-collection";
import type { CrudColumn } from "./crud/table";
import { OperatorErrorState } from "./ui/error-state";
import { OperatorSection } from "./ui/section";

const states: Array<[OperatorWithdrawalState, string]> = [
  ["requested", "Requested"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["cancelled", "Cancelled"],
  ["completed", "Completed"],
  ["failed", "Failed"],
];
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Withdrawal data is temporarily unavailable.";
export function OperatorWithdrawalList() {
  const [search, setSearch] = useState("");
  const [state, setState] = useState<OperatorWithdrawalState | "">("");
  const [attention, setAttention] = useState("");
  const collection = useCrudCollection(
    async (
      filters: { search: string; state: OperatorWithdrawalState | ""; attention: string },
      cursor,
    ) => {
      const params = new URLSearchParams({ limit: "25" });
      if (filters.search) params.set("search", filters.search);
      if (filters.state) params.set("state", filters.state);
      if (filters.attention) params.set("attention", filters.attention);
      if (cursor) params.set("cursor", cursor);
      const result = await apiFetch<OperatorWithdrawalPage>(`/api/operator/withdrawals?${params}`);
      return { items: result.items, nextCursor: result.nextCursor };
    },
    { search: "", state: "", attention: "" },
  );
  useEffect(() => {
    void collection.apply({ search: "", state: "", attention: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  type Withdrawal = OperatorWithdrawalPage["items"][number];
  const columns: readonly CrudColumn<Withdrawal>[] = [
    {
      key: "account",
      label: "Account",
      primary: true,
      render: (item) => (
        <OperatorPrimaryCell
          title={<Link href={`/operator/users/${item.account.id}`}>@{item.account.username}</Link>}
          subtitle={item.account.email ?? item.account.id}
        />
      ),
    },
    {
      key: "destination",
      label: "Destination",
      render: (item) => item.destination?.name ?? "Saved destination",
    },
    {
      key: "state",
      label: "State / attention",
      render: (item) => (
        <div className="grid gap-1">
          <OperatorStatusCell status={item.state} />
          <span className="text-xs text-slate-500">
            {item.attention === "none" ? "No action" : item.attention.replaceAll("_", " ")}
          </span>
        </div>
      ),
    },
    {
      key: "requested",
      label: "Requested",
      render: (item) => new Date(item.createdAt).toLocaleString(),
    },
    {
      key: "amount",
      label: "Amount",
      render: (item) => (
        <OperatorValueCell>
          <Money minor={item.amountMinor} />
        </OperatorValueCell>
      ),
    },
  ];
  return (
    <CrudIndex
      eyebrow="Withdrawal operations"
      title="Withdrawal requests"
      description="Review reserved earnings, then record when an external payment has been sent."
      filters={
        <>
          <OperatorFilterField
            label="Account, withdrawal, or destination"
            htmlFor="withdrawal-search"
          >
            <Input
              id="withdrawal-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ID, username, email, reference"
            />
          </OperatorFilterField>
          <OperatorFilterField label="State" htmlFor="withdrawal-state">
            <Select
              id="withdrawal-state"
              value={state}
              onChange={(e) => setState(e.target.value as OperatorWithdrawalState | "")}
            >
              <option value="">All states</option>
              {states.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </OperatorFilterField>
          <OperatorFilterField label="Attention" htmlFor="withdrawal-attention">
            <Select
              id="withdrawal-attention"
              value={attention}
              onChange={(e) => setAttention(e.target.value)}
            >
              <option value="">All attention</option>
              <option value="review">Needs review</option>
              <option value="action_required">Payment/action required</option>
            </Select>
          </OperatorFilterField>
        </>
      }
      onFiltersSubmit={(event) => {
        event.preventDefault();
        void collection.apply({ search: search.trim(), state, attention });
      }}
      toolbarActions={
        <Button type="submit" variant="secondary" disabled={collection.loading}>
          Apply filters
        </Button>
      }
      items={collection.items}
      columns={columns}
      getRowKey={(item) => item.id}
      actions={(item) => [
        { type: "link", label: "Inspect withdrawal", href: `/operator/withdrawals/${item.id}` },
        { type: "link", label: "View account", href: `/operator/users/${item.account.id}` },
      ]}
      actionLabel={(item) => `Actions for withdrawal ${item.id}`}
      loading={collection.loading}
      error={collection.error}
      onRetry={() => void collection.retry()}
      emptyTitle="No withdrawal requests found"
      emptyDescription="Try another search or filter."
      pagination={{
        hasPrevious: collection.hasPrevious,
        hasNext: collection.hasNext,
        onPrevious: () => void collection.previous(),
        onNext: () => void collection.next(),
      }}
      sectionTitle="Withdrawal history"
      sectionDescription="Transition controls remain on each record and are validated by the server."
    />
  );
}

export function OperatorWithdrawalDetail({ withdrawalId }: { withdrawalId: string }) {
  const [item, setItem] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [completionNote, setCompletionNote] = useState("");
  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItem(await apiFetch<Detail>(`/api/operator/withdrawals/${withdrawalId}`));
    } catch (cause) {
      setError(message(cause));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withdrawalId]);
  async function act(action: "approve" | "reject" | "complete", body?: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const status =
        action === "approve" ? "approved" : action === "reject" ? "rejected" : "completed";
      await apiFetch(`/api/operator/withdrawals/${withdrawalId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, ...body }),
      });
      await load();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  if (loading && !item) return <CrudDetail eyebrow="Withdrawal fact" title="Withdrawal" loading />;
  if (!item)
    return (
      <CrudDetail
        eyebrow="Withdrawal fact"
        title="Withdrawal unavailable"
        error={{
          title: "Withdrawal unavailable",
          message: error ?? "This withdrawal was not found.",
          retry: () => void load(),
        }}
      />
    );
  return (
    <CrudDetail
      eyebrow="Withdrawal fact"
      title={`${formatMinorUsd(item.amountMinor)} withdrawal`}
      description={item.id}
      headerActions={<OperatorStatusCell status={item.state} />}
      sections={
        <>
          {error && <OperatorErrorState message={error} />}
          <div className="grid gap-4 lg:grid-cols-2">
            <OperatorSection title="Account" surface>
              <p>
                <strong>@{item.account.username}</strong>
                <br />
                {item.account.email ?? "No authentication email"}
              </p>
              <Link href={`/operator/users/${item.account.id}`}>View account</Link>
            </OperatorSection>
            <OperatorSection title="Destination" surface>
              <p className="mb-3">
                {item.destination.methodName} · {item.destination.name}
              </p>
              <dl className="grid gap-3">
                {item.destination.fields.map((field) => (
                  <div key={field.name} className="min-w-0">
                    <dt className="text-xs font-semibold text-slate-500">{field.label}</dt>
                    <dd className="break-all">
                      {field.copyable ? (
                        <CopyValue
                          label={field.label}
                          value={field.value}
                          displayValue={field.displayValue}
                        />
                      ) : (
                        (field.displayValue ?? field.value)
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </OperatorSection>
            <OperatorSection title="Reservation" surface>
              <p>
                {item.reservation
                  ? `${item.reservation.state} · ${formatMinorUsd(item.reservation.amountMinor)}`
                  : "No reservation record"}
              </p>
            </OperatorSection>
          </div>
          {item.state === "completed" && (
            <OperatorSection title="Completion record" surface>
              <p>External reference: {item.externalReference ?? "Not provided"}</p>
              <p>Note: {item.completionNote ?? "Not provided"}</p>
              <p>Recorded by: {item.completedBy ?? "Unknown"}</p>
              <p>
                Completed at: {item.completedAt ? new Date(item.completedAt).toLocaleString() : "—"}
              </p>
            </OperatorSection>
          )}
          <OperatorSection title="Available actions" surface>
            <div className="operator-action-row">
              {item.state === "requested" && (
                <Button disabled={busy} onClick={() => void act("approve")}>
                  Approve
                </Button>
              )}
              {item.state === "requested" || item.state === "approved" ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (reason.trim()) void act("reject", { reason });
                  }}
                >
                  <Input
                    aria-label="Rejection reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason for rejection"
                  />
                  <Button variant="secondary" disabled={busy || reason.trim().length < 3}>
                    Reject
                  </Button>
                </form>
              ) : null}
              {item.state === "approved" && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void act("complete", {
                      external_reference: externalReference.trim() || undefined,
                      note: completionNote.trim() || undefined,
                    });
                  }}
                  className="operator-action-row"
                >
                  <p className="panel-intro">
                    Send the payment outside Cliqero first. This action only records a payment that
                    has already been sent.
                  </p>
                  <Input
                    aria-label="External payment reference"
                    value={externalReference}
                    onChange={(event) => setExternalReference(event.target.value)}
                    placeholder="External reference (optional)"
                    maxLength={200}
                  />
                  <Input
                    aria-label="Completion note"
                    value={completionNote}
                    onChange={(event) => setCompletionNote(event.target.value)}
                    placeholder="Note (optional)"
                    maxLength={500}
                  />
                  <Button disabled={busy}>Mark as paid</Button>
                </form>
              )}
            </div>
          </OperatorSection>
        </>
      }
    />
  );
}
