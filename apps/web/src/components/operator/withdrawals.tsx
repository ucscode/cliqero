"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  apiFetch,
  formatMinorUsd,
  parseUsdMinor,
  type OperatorAccountSummary,
  type OperatorWithdrawalDetail as Detail,
  type OperatorWithdrawalPage,
  type OperatorWithdrawalState,
  type WithdrawalDestination,
} from "@/lib/api-client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { CopyValue } from "../copy-value";
import { Money } from "../money";
import { OperatorPrimaryCell, OperatorStatusCell, OperatorValueCell } from "./ui/data-cells";
import { OperatorFilterField } from "./ui/toolbar";
import { CrudIndex } from "@/components/crud/index-page";
import { CrudDetail } from "@/components/crud/detail";
import { useCrudCollection } from "@/components/crud/use-collection";
import type { CrudColumn } from "@/components/crud/table";
import { OperatorErrorState } from "./ui/error-state";
import { OperatorSection } from "./ui/section";
import { CrudSortSelect } from "@/components/crud/sort-select";
import type { FormEvent } from "react";

function minorToMajor(value: string) {
  const amount = BigInt(value);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`;
}

export function operatorWithdrawalEditPolicy(state: OperatorWithdrawalState) {
  if (state === "requested")
    return {
      editable: true,
      amountAndDestinationLocked: false,
      stateOptions: ["requested", "approved", "rejected"] as const,
    };
  if (state === "approved")
    return {
      editable: true,
      amountAndDestinationLocked: true,
      stateOptions: ["approved", "rejected"] as const,
    };
  return { editable: false, amountAndDestinationLocked: true, stateOptions: [] as const };
}

export function OperatorWithdrawalForm({ withdrawalId }: { withdrawalId?: string }) {
  const router = useRouter();
  const [item, setItem] = useState<Detail | null>(null);
  const [accounts, setAccounts] = useState<OperatorAccountSummary[]>([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [accountId, setAccountId] = useState("");
  const [destinations, setDestinations] = useState<WithdrawalDestination[]>([]);
  const [destinationId, setDestinationId] = useState("");
  const [amount, setAmount] = useState("");
  const [state, setState] = useState<"requested" | "approved" | "rejected">("requested");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(Boolean(withdrawalId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [accountsResult, detail] = await Promise.all([
          apiFetch<{ items: OperatorAccountSummary[] }>("/internal/withdrawals/accounts?search="),
          withdrawalId
            ? apiFetch<Detail>(`/internal/withdrawals/${withdrawalId}`)
            : Promise.resolve(null),
        ]);
        if (!active) return;
        let options = accountsResult.items;
        if (detail) {
          setItem(detail);
          setAccountId(detail.account.id);
          setAmount(minorToMajor(detail.amountMinor));
          setState(
            detail.state === "approved" || detail.state === "rejected" ? detail.state : "requested",
          );
          setReason(detail.reason ?? "");
          if (!options.some((entry) => entry.id === detail.account.id))
            options = [
              {
                id: detail.account.id,
                username: detail.account.username,
                displayName: null,
                email: detail.account.email,
                country: null,
                createdAt: "",
                directReferralCount: 0,
              },
              ...options,
            ];
          if (!operatorWithdrawalEditPolicy(detail.state).editable)
            throw new Error("This withdrawal has no editable fields.");
        } else if (options[0]) setAccountId(options[0].id);
        setAccounts(options);
      } catch (cause) {
        if (active) setError(message(cause));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [withdrawalId]);

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    void apiFetch<WithdrawalDestination[]>(
      `/internal/withdrawals/destinations?account_id=${encodeURIComponent(accountId)}`,
    )
      .then((result) => {
        if (!active) return;
        const available = result.filter(
          (destination) => destination.status === "active" && destination.method.available,
        );
        setDestinations(available);
        if (
          item?.destination.savedDestinationId &&
          available.some((entry) => entry.id === item.destination.savedDestinationId)
        )
          setDestinationId(item.destination.savedDestinationId);
        else setDestinationId(available[0]?.id ?? "");
      })
      .catch((cause: unknown) => active && setError(message(cause)));
    return () => {
      active = false;
    };
  }, [accountId, item]);

  async function searchAccounts(value: string) {
    setAccountSearch(value);
    try {
      const result = await apiFetch<{ items: OperatorAccountSummary[] }>(
        `/internal/withdrawals/accounts?search=${encodeURIComponent(value)}`,
      );
      setAccounts(result.items);
    } catch (cause) {
      setError(message(cause));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    let amountMinor: string;
    try {
      amountMinor = parseUsdMinor(amount);
    } catch (cause) {
      setError(message(cause));
      return;
    }
    setSaving(true);
    try {
      if (withdrawalId) {
        await apiFetch(`/internal/withdrawals/${withdrawalId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            amount_minor: amountMinor,
            destination_id: destinationId,
            state,
            reason,
          }),
        });
      } else {
        await apiFetch("/internal/withdrawals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            account_id: accountId,
            amount_minor: amountMinor,
            destination_id: destinationId,
            idempotency_key: crypto.randomUUID(),
          }),
        });
      }
      router.push("/operator/withdrawals");
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <CrudDetail eyebrow="Withdrawal operations" title="Withdrawal" loading />;
  return (
    <CrudDetail
      eyebrow="Withdrawal operations"
      title={withdrawalId ? "Edit withdrawal" : "New withdrawal"}
      description="Operator-created requests use the account’s saved payout destination and the same policy, fee, balance reservation, and idempotency rules as customer requests."
      sections={
        <OperatorSection title="Withdrawal request" surface>
          {error && <OperatorErrorState message={error} />}
          <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
            {!withdrawalId && (
              <label className="grid gap-1 text-sm font-medium">
                Account
                <Input
                  value={accountSearch}
                  onChange={(event) => void searchAccounts(event.target.value)}
                  placeholder="Search username or email"
                />
                <Select
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  required
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      @{account.username}
                      {account.email ? ` · ${account.email}` : ""}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <label className="grid gap-1 text-sm font-medium">
              Amount (USD)
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
                disabled={
                  item ? operatorWithdrawalEditPolicy(item.state).amountAndDestinationLocked : false
                }
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Payout destination
              <Select
                value={destinationId}
                onChange={(event) => setDestinationId(event.target.value)}
                required
                disabled={
                  (item
                    ? operatorWithdrawalEditPolicy(item.state).amountAndDestinationLocked
                    : false) || !destinations.length
                }
              >
                <option value="">
                  {destinations.length ? "Select destination" : "No available saved destination"}
                </option>
                {destinations.map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destination.name} · {destination.method.display_name}
                  </option>
                ))}
              </Select>
            </label>
            {withdrawalId && (
              <label className="grid gap-1 text-sm font-medium">
                Status
                <Select
                  value={state}
                  onChange={(event) => setState(event.target.value as typeof state)}
                >
                  {operatorWithdrawalEditPolicy(item?.state ?? "requested").stateOptions.map(
                    (option) => (
                      <option key={option} value={option}>
                        {option[0].toUpperCase() + option.slice(1)}
                      </option>
                    ),
                  )}
                </Select>
              </label>
            )}
            {withdrawalId && (
              <label className="grid gap-1 text-sm font-medium">
                Reason
                <Input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={1000}
                  placeholder="Required when rejecting"
                />
              </label>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving || !accountId || !destinationId}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push("/operator/withdrawals")}
              >
                Cancel
              </Button>
            </div>
          </form>
        </OperatorSection>
      }
    />
  );
}

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
export function OperatorWithdrawalList({ canManage = false }: { canManage?: boolean }) {
  const [search, setSearch] = useState("");
  const [state, setState] = useState<OperatorWithdrawalState | "">("");
  const [attention, setAttention] = useState("");
  const [sortChoice, setSortChoice] = useState("created:desc");
  const [sort, direction] = sortChoice.split(":") as ["created" | "amount", "asc" | "desc"];
  const collection = useCrudCollection(
    async (
      filters: {
        search: string;
        state: OperatorWithdrawalState | "";
        attention: string;
        sort: string;
        direction: string;
      },
      cursor,
      pageSize,
    ) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (filters.search) params.set("search", filters.search);
      params.set("state", filters.state || "all");
      if (filters.attention) params.set("attention", filters.attention);
      params.set("sort", filters.sort);
      params.set("direction", filters.direction);
      if (cursor) params.set("cursor", cursor);
      const result = await apiFetch<OperatorWithdrawalPage>(`/internal/withdrawals?${params}`);
      return { items: result.items, nextCursor: result.nextCursor };
    },
    { search: "", state: "", attention: "", sort: "created", direction: "desc" },
  );
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
              type="search"
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
          attention: "",
          sort: "created",
          direction: "desc",
        });
        if (ok) {
          setSearch("");
          setState("");
          setAttention("");
          setSortChoice("created:desc");
        }
        return ok;
      }}
      filtersDirty={Boolean(search.trim() || state || attention || sortChoice !== "created:desc")}
      onFiltersSubmit={async (event) => {
        event.preventDefault();
        return collection.apply({ search: search.trim(), state, attention, sort, direction });
      }}
      toolbarActions={
        <Button type="submit" variant="action" disabled={collection.loading}>
          Apply filters
        </Button>
      }
      items={collection.items}
      columns={columns}
      getRowKey={(item) => item.id}
      selection={{ labelForItem: (item) => `withdrawal ${item.id}` }}
      createAction={
        canManage ? { label: "New withdrawal", href: "/operator/withdrawals/new" } : undefined
      }
      bulkActions={
        canManage
          ? [
              {
                value: "delete",
                label: "Delete",
                destructive: true,
                onSelect: async (items) => {
                  if (
                    !window.confirm(
                      `Delete ${items.length} mutable withdrawal request(s)? Completed payouts cannot be deleted.`,
                    )
                  )
                    return false;
                  const result = await apiFetch<{
                    results: Array<{ id: string; deleted: boolean; error: string | null }>;
                  }>("/internal/withdrawals/bulk-delete", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ ids: items.map((item) => item.id) }),
                  });
                  await collection.retry();
                  const failures = result.results.filter((entry) => !entry.deleted);
                  if (failures.length)
                    throw new Error(
                      failures.map((entry) => `${entry.id}: ${entry.error}`).join("; "),
                    );
                },
              },
            ]
          : []
      }
      actions={(item) => [
        { type: "link", label: "Inspect withdrawal", href: `/operator/withdrawals/${item.id}` },
        ...(canManage && operatorWithdrawalEditPolicy(item.state).editable
          ? [
              {
                type: "link" as const,
                label: "Edit",
                href: `/operator/withdrawals/${item.id}/edit`,
              },
            ]
          : []),
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

export function OperatorWithdrawalDetail({
  withdrawalId,
  canManage = false,
}: {
  withdrawalId: string;
  canManage?: boolean;
}) {
  const router = useRouter();
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
      setItem(await apiFetch<Detail>(`/internal/withdrawals/${withdrawalId}`));
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
      await apiFetch(`/internal/withdrawals/${withdrawalId}/transition`, {
        method: "POST",
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
  async function remove() {
    if (
      !window.confirm(
        "Delete this mutable withdrawal request? Completed payout history cannot be deleted.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/internal/withdrawals/${withdrawalId}`, { method: "DELETE" });
      router.push("/operator/withdrawals");
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
      headerActions={
        <>
          {canManage && operatorWithdrawalEditPolicy(item.state).editable && (
            <Button asChild>
              <Link href={`/operator/withdrawals/${item.id}/edit`}>Edit</Link>
            </Button>
          )}
          <OperatorStatusCell status={item.state} />
        </>
      }
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
              {canManage &&
                ["requested", "rejected", "cancelled", "failed"].includes(item.state) && (
                  <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
                    Delete
                  </Button>
                )}
              {canManage && item.state === "requested" && (
                <Button disabled={busy} onClick={() => void act("approve")}>
                  Approve
                </Button>
              )}
              {canManage && (item.state === "requested" || item.state === "approved") ? (
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
              {canManage && item.state === "approved" && (
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
