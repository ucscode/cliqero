"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
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
import { OperatorAccountSelector } from "./ui/account-selector";
import { useOperatorConfirmation } from "./ui/confirmation";
import type { Capability } from "@/modules/identity/capabilities";
import { OperatorResourceLink } from "./ui/resource-link";
import { Textarea } from "../ui/textarea";
import { RequiredLabel } from "../ui/label";

function minorToMajor(value: string) {
  const amount = BigInt(value);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`;
}

export function operatorWithdrawalEditPolicy(
  state: OperatorWithdrawalState,
  payoutInitiated = false,
) {
  if (state === "approved" && payoutInitiated)
    return { editable: false, amountAndDestinationLocked: true, stateOptions: [] as const };
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

export function operatorWithdrawalDeleteAllowed(
  state: OperatorWithdrawalState,
  canManage: boolean,
  payoutInitiated = false,
) {
  if (payoutInitiated || state === "completed") return false;
  return canManage && ["requested", "approved", "rejected", "cancelled", "failed"].includes(state);
}

export function OperatorWithdrawalForm({ withdrawalId }: { withdrawalId?: string }) {
  const router = useRouter();
  const [item, setItem] = useState<Detail | null>(null);
  const [account, setAccount] = useState<OperatorAccountSummary | null>(null);
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
        const detail = withdrawalId
          ? await apiFetch<Detail>(`/internal/withdrawals/${withdrawalId}`)
          : null;
        if (!active) return;
        if (detail) {
          setItem(detail);
          setAccount({
            id: detail.account.id,
            username: detail.account.username,
            email: detail.account.email,
            displayName: null,
            country: null,
            createdAt: "",
            directReferralCount: 0,
          });
          setAmount(minorToMajor(detail.amountMinor));
          setState(
            detail.state === "approved" || detail.state === "rejected" ? detail.state : "requested",
          );
          setReason(detail.reason ?? "");
          if (
            !operatorWithdrawalEditPolicy(detail.state, Boolean(detail.payoutInitiation)).editable
          )
            throw new Error("This withdrawal has no editable fields.");
        }
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
    if (!account?.id) return;
    let active = true;
    void apiFetch<WithdrawalDestination[]>(
      `/internal/withdrawals/destinations?account_id=${encodeURIComponent(account.id)}`,
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
  }, [account?.id, item]);

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
            account_id: account?.id,
            amount_minor: amountMinor,
            destination_id: destinationId,
            idempotency_key: crypto.randomUUID(),
            state,
            reason,
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
              <div className="grid gap-1 text-sm font-medium">
                <RequiredLabel htmlFor="withdrawal-account">Account</RequiredLabel>
                <OperatorAccountSelector
                  inputId="withdrawal-account"
                  endpoint="/internal/withdrawals/accounts"
                  value={account}
                  onChange={setAccount}
                  required
                />
              </div>
            )}
            <label className="required grid gap-1 text-sm font-medium">
              Amount (USD)
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
                disabled={
                  item
                    ? operatorWithdrawalEditPolicy(item.state, Boolean(item.payoutInitiation))
                        .amountAndDestinationLocked
                    : false
                }
              />
            </label>
            <label className="required grid gap-1 text-sm font-medium">
              Payout destination
              <Select
                value={destinationId}
                onChange={(event) => setDestinationId(event.target.value)}
                required
                disabled={
                  (item
                    ? operatorWithdrawalEditPolicy(item.state, Boolean(item.payoutInitiation))
                        .amountAndDestinationLocked
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
            {
              <label className="required grid gap-1 text-sm font-medium">
                Status
                <Select
                  value={state}
                  onChange={(event) => setState(event.target.value as typeof state)}
                >
                  {operatorWithdrawalEditPolicy(
                    item?.state ?? "requested",
                    Boolean(item?.payoutInitiation),
                  ).stateOptions.map((option) => (
                    <option key={option} value={option}>
                      {option[0].toUpperCase() + option.slice(1)}
                    </option>
                  ))}
                </Select>
              </label>
            }
            {
              <label
                className={`grid gap-1 text-sm font-medium ${state === "rejected" ? "required" : ""}`}
              >
                Reason
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={1000}
                  placeholder="Required when rejecting"
                  required={state === "rejected"}
                />
              </label>
            }
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={saving || (!withdrawalId && !account?.id) || !destinationId}
              >
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
export function OperatorWithdrawalList({
  canManage = false,
  capabilities = [],
}: {
  canManage?: boolean;
  capabilities?: readonly Capability[];
}) {
  const confirm = useOperatorConfirmation();
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
          title={
            <OperatorResourceLink
              capabilities={capabilities}
              requiredCapability="accounts.read"
              href={`/operator/users/${item.account.id}`}
            >
              @{item.account.username}
            </OperatorResourceLink>
          }
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
      capabilities={capabilities}
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
                    !(await confirm({
                      title: `Delete ${items.length} withdrawal record(s)?`,
                      description:
                        "Uninitiated withdrawals are permanently removed; completed or externally initiated payouts remain financial history.",
                      confirmLabel: "Delete",
                      destructive: true,
                    }))
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
        { type: "link", label: "View", href: `/operator/withdrawals/${item.id}` },
        ...(operatorWithdrawalDeleteAllowed(item.state, canManage, Boolean(item.payoutInitiation))
          ? [
              {
                type: "action" as const,
                label: "Delete",
                destructive: true,
                onSelect: async () => {
                  if (
                    !(await confirm({
                      title: "Delete withdrawal?",
                      description: "This withdrawal record will be permanently removed.",
                      confirmLabel: "Delete",
                      destructive: true,
                    }))
                  )
                    return;
                  await apiFetch(`/internal/withdrawals/${item.id}`, { method: "DELETE" });
                  await collection.retry();
                },
              },
            ]
          : []),
        ...(canManage &&
        operatorWithdrawalEditPolicy(item.state, Boolean(item.payoutInitiation)).editable
          ? [
              {
                type: "link" as const,
                label: "Edit",
                href: `/operator/withdrawals/${item.id}/edit`,
              },
            ]
          : []),
        {
          type: "link",
          label: "View account",
          href: `/operator/users/${item.account.id}`,
          requiredCapability: "accounts.read",
        },
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
  capabilities = [],
}: {
  withdrawalId: string;
  canManage?: boolean;
  capabilities?: readonly Capability[];
}) {
  const [item, setItem] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initiationReference, setInitiationReference] = useState("");
  const [completionReference, setCompletionReference] = useState("");
  const [completionNote, setCompletionNote] = useState("");
  const [failureReference, setFailureReference] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const initiationKey = useRef<string | null>(null);
  const failureKey = useRef<string | null>(null);
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
  async function submitPayoutCommand(
    operation: "payout-initiation" | "payout-failure",
    key: MutableRefObject<string | null>,
    body: Record<string, string | null>,
  ) {
    if (!canManage) return;
    setSaving(true);
    setError(null);
    key.current ??= crypto.randomUUID();
    try {
      await apiFetch(`/api/withdrawals/${withdrawalId}/${operation}`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key.current },
        body: JSON.stringify(body),
      });
      key.current = null;
      await load();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  }
  async function completePayout() {
    if (!canManage) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/withdrawals/${withdrawalId}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          external_reference: completionReference.trim() || undefined,
          note: completionNote.trim() || undefined,
        }),
      });
      await load();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
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
          {canManage &&
            operatorWithdrawalEditPolicy(item.state, Boolean(item.payoutInitiation)).editable && (
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
              <OperatorResourceLink
                capabilities={capabilities}
                requiredCapability="accounts.read"
                href={`/operator/users/${item.account.id}`}
              >
                View account
              </OperatorResourceLink>
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
          {item.state === "approved" && (
            <OperatorSection
              title="Payout outcome"
              description="Approval reserves funds; it does not mean an external payout has started."
              surface
            >
              {!item.payoutInitiation ? (
                <div className="grid gap-3">
                  <p>
                    Approved, payout initiation not recorded. This does not establish whether an
                    external instruction was previously submitted. Verify the external status before
                    proceeding. Recording initiation runs the debt check and attests that you are
                    starting the payout workflow; it does not prove provider acceptance or
                    settlement.
                  </p>
                  <label className="grid gap-1 text-sm font-medium">
                    Payout instruction reference (if already assigned)
                    <Input
                      value={initiationReference}
                      onChange={(event) => setInitiationReference(event.target.value)}
                      maxLength={200}
                    />
                  </label>
                  {canManage && (
                    <Button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        void submitPayoutCommand("payout-initiation", initiationKey, {
                          external_reference: initiationReference.trim() || null,
                        })
                      }
                    >
                      Start payout workflow
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid gap-3">
                  <p className="font-medium">
                    Payout workflow started, awaiting authoritative external outcome.
                  </p>
                  <p>
                    Initiated by @{item.payoutInitiation.actorUsername} on{" "}
                    {new Date(item.payoutInitiation.createdAt).toLocaleString()}.
                    {item.payoutInitiation.externalReference
                      ? ` Reference: ${item.payoutInitiation.externalReference}.`
                      : ""}
                  </p>
                  {canManage && (
                    <>
                      <p>
                        Continue the external submission now, if it has not already been submitted.
                        The stored initiation records the workflow start, not provider execution.
                        Record completion only after authoritative confirmation of delivery. If
                        delivery is confirmed not to have occurred, use the failure reconciliation
                        below. Do not resolve an uncertain outcome as failed.
                      </p>
                      <label className="grid gap-1 text-sm font-medium">
                        Delivery confirmation reference (optional)
                        <Input
                          value={completionReference}
                          onChange={(event) => setCompletionReference(event.target.value)}
                          maxLength={200}
                        />
                      </label>
                      <label className="grid gap-1 text-sm font-medium">
                        Completion note (optional)
                        <Textarea
                          value={completionNote}
                          onChange={(event) => setCompletionNote(event.target.value)}
                          maxLength={500}
                        />
                      </label>
                      <Button type="button" disabled={saving} onClick={() => void completePayout()}>
                        Record confirmed payout
                      </Button>
                      <div className="grid gap-3 border-t border-slate-200 pt-3">
                        <p className="font-medium">Confirmed non-delivery</p>
                        <label className="grid gap-1 text-sm font-medium">
                          Provider/bank outcome reference
                          <Input
                            value={failureReference}
                            onChange={(event) => setFailureReference(event.target.value)}
                            maxLength={200}
                            required
                          />
                        </label>
                        <label className="grid gap-1 text-sm font-medium">
                          Evidence-backed reason
                          <Textarea
                            value={failureReason}
                            onChange={(event) => setFailureReason(event.target.value)}
                            maxLength={1000}
                            required
                          />
                        </label>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={
                            saving || !failureReference.trim() || failureReason.trim().length < 3
                          }
                          onClick={() =>
                            void submitPayoutCommand("payout-failure", failureKey, {
                              external_reference: failureReference.trim(),
                              reason: failureReason.trim(),
                            })
                          }
                        >
                          Record confirmed payout failure
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </OperatorSection>
          )}
          {item.payoutFailure && (
            <OperatorSection title="Confirmed payout failure" surface>
              <p>{item.payoutFailure.reason}</p>
              <p>External outcome reference: {item.payoutFailure.externalReference}</p>
              <p>
                Recorded by @{item.payoutFailure.actorUsername} on{" "}
                {new Date(item.payoutFailure.createdAt).toLocaleString()}
              </p>
              <p>
                The external instruction was confirmed not delivered; the reservation was released.
              </p>
            </OperatorSection>
          )}
          {item.payoutReturn && (
            <OperatorSection title="Returned payout" surface>
              <p>{item.payoutReturn.reason}</p>
              <p>External return reference: {item.payoutReturn.externalReference}</p>
              <p>The payout was returned after completion; the return was recorded separately.</p>
            </OperatorSection>
          )}
        </>
      }
    />
  );
}
