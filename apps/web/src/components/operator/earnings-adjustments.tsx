"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Alert } from "../ui/alert";
import { Money } from "../money";
import { CrudIndex } from "@/components/crud/index-page";
import { CrudDetail } from "@/components/crud/detail";
import type { CrudColumn } from "@/components/crud/table";
import type { CrudBulkAction } from "@/components/crud/bulk-actions";
import { runOperatorBulkAction } from "@/app/operator/bulk-actions";
import { OperatorPrimaryCell } from "./ui/data-cells";
import { OperatorBulkOutcome, type OperatorBulkOutcomeData } from "./ui/bulk-outcome";
import AsyncSelect from "react-select/async";
import type { OperatorAccountPage } from "@/lib/api-client";

type Adjustment = {
  id: string;
  accountId: string;
  accountUsername: string;
  amountMinor: string;
  reason: string;
  reference: string | null;
  createdBy: string;
  createdAt: string;
};

type AccountOption = { value: string; label: string };
const accountSelectStyles = {
  control: (base: object) => ({ ...base, minHeight: 42 }),
  menuPortal: (base: object) => ({ ...base, zIndex: 80 }),
};

export function OperatorEarningsAdjustmentForm({
  onCreated,
}: {
  onCreated?: () => void | Promise<void>;
}) {
  const [account, setAccount] = useState<AccountOption | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function searchAccounts(query: string): Promise<AccountOption[]> {
    if (!query.trim()) return [];
    const result = await apiFetch<OperatorAccountPage>(
      `/api/accounts?search=${encodeURIComponent(query.trim())}&limit=10`,
    );
    return result.items.map((item) => ({
      value: item.id,
      label: `@${item.username} · ${item.displayName || item.email || item.id}`,
    }));
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch<Adjustment>("/internal/earnings-adjustments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account_id: account?.value,
          amount_minor: amount.trim(),
          reason,
          reference: reference.trim() || null,
        }),
      });
      setAccount(null);
      setAmount("");
      setReason("");
      setReference("");
      await onCreated?.();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "The adjustment could not be created.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={create} className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-2">
      <h2 className="text-lg font-semibold md:col-span-2">New adjustment</h2>
      <p className="text-sm text-slate-600 md:col-span-2">
        This posts an immutable ledger fact. Positive increases the account balance; negative
        decreases it.
      </p>
      <div className="grid gap-2">
        <Label htmlFor="adjustment-account">Account</Label>
        <AsyncSelect<AccountOption, false>
          inputId="adjustment-account"
          instanceId="adjustment-account"
          cacheOptions
          defaultOptions={false}
          loadOptions={searchAccounts}
          value={account}
          onChange={setAccount}
          placeholder="Search by username, email, or name"
          noOptionsMessage={() => "Search for an account"}
          styles={accountSelectStyles}
          menuPortalTarget={typeof document === "undefined" ? undefined : document.body}
          aria-label="Account"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="adjustment-amount">Signed amount in USD minor units</Label>
        <Input
          id="adjustment-amount"
          inputMode="numeric"
          placeholder="e.g. 1000 or -500"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-2 md:col-span-2">
        <Label htmlFor="adjustment-reason">Reason</Label>
        <Input
          id="adjustment-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="adjustment-reference">Reference (optional)</Label>
        <Input
          id="adjustment-reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
      </div>
      <div className="flex items-end">
        <Button disabled={saving}>{saving ? "Posting…" : "Post adjustment"}</Button>
      </div>
      {error && (
        <div className="md:col-span-2">
          <Alert>{error}</Alert>
        </div>
      )}
    </form>
  );
}

export function OperatorEarningsAdjustments({
  canManage,
  canDelete = false,
}: {
  canManage: boolean;
  canDelete?: boolean;
}) {
  const [items, setItems] = useState<Adjustment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bulkOutcome, setBulkOutcome] = useState<OperatorBulkOutcomeData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ items: Adjustment[] }>(
        "/internal/earnings-adjustments?limit=50",
      );
      setItems(result.items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Adjustments are unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // The first load displays append-only persisted adjustment facts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const columns: readonly CrudColumn<Adjustment>[] = [
    {
      key: "account",
      label: "Account",
      primary: true,
      render: (item) => (
        <OperatorPrimaryCell
          title={<Link href={`/operator/users/${item.accountId}`}>@{item.accountUsername}</Link>}
          subtitle={item.accountId}
        />
      ),
    },
    {
      key: "amount",
      label: "Amount (USD)",
      render: (item) => (
        <Money
          minor={item.amountMinor.startsWith("-") ? item.amountMinor : `+${item.amountMinor}`}
        />
      ),
    },
    {
      key: "reason",
      label: "Reason",
      render: (item) => (
        <span className="break-words">
          {item.reason}
          {item.reference ? (
            <small className="block text-slate-500">Reference: {item.reference}</small>
          ) : null}
        </span>
      ),
    },
    {
      key: "actor",
      label: "Created by",
      render: (item) => <Link href={`/operator/users/${item.createdBy}`}>{item.createdBy}</Link>,
    },
    {
      key: "created",
      label: "Created",
      render: (item) => new Date(item.createdAt).toLocaleString(),
    },
  ];
  const bulkActions: readonly CrudBulkAction<Adjustment>[] = canDelete
    ? [
        {
          value: "delete",
          label: "Delete",
          destructive: true,
          onSelect: async (selected) => {
            if (!window.confirm(`Delete ${selected.length} selected earning adjustments?`))
              return false;
            const outcome = await runOperatorBulkAction({
              resource: "earnings-adjustments",
              action: "delete",
              ids: selected.map((item) => item.id),
            });
            await load();
            if (outcome.failed.length) {
              setBulkOutcome({
                resource: "earning adjustments",
                selectedCount: selected.length,
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
      eyebrow="Append-only earnings ledger"
      title="Earning adjustments"
      description="Signed USD adjustments are immutable. Positive amounts increase earnings; negative amounts reduce them. Correct mistakes with an equal and opposite adjustment."
      headerActions={
        <Link className="text-sm underline" href="/operator/earnings">
          Generated earnings
        </Link>
      }
      createAction={
        canManage
          ? { label: "New adjustment", href: "/operator/earnings-adjustments/new" }
          : undefined
      }
      items={items}
      columns={columns}
      getRowKey={(item) => item.id}
      selection={
        canDelete ? { labelForItem: (item) => `earning adjustment ${item.id}` } : undefined
      }
      bulkActions={bulkActions}
      actions={(item) => [
        { type: "link", label: "View", href: `/operator/earnings-adjustments/${item.id}` },
        ...(canDelete
          ? [
              {
                type: "action" as const,
                label: "Delete",
                destructive: true,
                onSelect: async () => {
                  if (!window.confirm("Delete this earnings adjustment?")) return;
                  await apiFetch(`/internal/earnings-adjustments/${item.id}`, {
                    method: "DELETE",
                  });
                  await load();
                },
              },
            ]
          : []),
      ]}
      actionLabel={(item) => `Actions for adjustment ${item.id}`}
      loading={loading}
      error={null}
      onRetry={() => void load()}
      beforeTable={
        <>
          {error && (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          {bulkOutcome && <OperatorBulkOutcome outcome={bulkOutcome} />}
        </>
      }
      emptyTitle="No earnings adjustments"
      emptyDescription="Posted manual corrections and bonuses appear here."
      sectionTitle="Adjustment ledger"
      sectionDescription="Created amounts, reasons and actors are preserved as historical facts."
    />
  );
}

export function OperatorEarningsAdjustmentDetail({ id }: { id: string }) {
  const [item, setItem] = useState<Adjustment | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // Inspection reloads the immutable persisted adjustment by id.
    void apiFetch<Adjustment>(`/internal/earnings-adjustments/${id}`)
      .then(setItem)
      .catch((cause) => {
        setError(cause instanceof ApiClientError ? cause.message : "Adjustment unavailable.");
      });
  }, [id]);
  if (!item)
    return (
      <CrudDetail
        eyebrow="Earnings adjustment"
        title="Adjustment"
        loading={!error}
        error={error ? { title: "Adjustment unavailable", message: error } : undefined}
      />
    );
  return (
    <CrudDetail
      eyebrow="Append-only ledger fact"
      title={item.reason}
      description={item.id}
      sections={
        <dl className="detail-list">
          <div>
            <dt>Account</dt>
            <dd>
              <Link href={`/operator/users/${item.accountId}`}>@{item.accountUsername}</Link>
            </dd>
          </div>
          <div>
            <dt>Amount (USD)</dt>
            <dd>
              <Money
                minor={item.amountMinor.startsWith("-") ? item.amountMinor : `+${item.amountMinor}`}
              />
            </dd>
          </div>
          <div>
            <dt>Reason</dt>
            <dd>{item.reason}</dd>
          </div>
          <div>
            <dt>Reference</dt>
            <dd>{item.reference ?? "—"}</dd>
          </div>
          <div>
            <dt>Created by</dt>
            <dd>
              <Link href={`/operator/users/${item.createdBy}`}>{item.createdBy}</Link>
            </dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{new Date(item.createdAt).toLocaleString()}</dd>
          </div>
        </dl>
      }
    />
  );
}
