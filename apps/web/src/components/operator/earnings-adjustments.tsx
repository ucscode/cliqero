"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiClientError, apiFetch, type OperatorAccountSummary } from "@/lib/api-client";
import { Input } from "../ui/input";
import { RequiredLabel, Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { useToast } from "../toast/provider";
import { Money } from "../money";
import { CrudEdit } from "@/components/crud/edit";
import { CrudIndex } from "@/components/crud/index-page";
import { CrudDetail } from "@/components/crud/detail";
import type { CrudColumn } from "@/components/crud/table";
import type { CrudBulkAction } from "@/components/crud/bulk-actions";
import { runOperatorBulkAction } from "@/app/operator/bulk-actions";
import { OperatorPrimaryCell } from "./ui/data-cells";
import { OperatorBulkOutcome, type OperatorBulkOutcomeData } from "./ui/bulk-outcome";
import { OperatorAccountSelector } from "./ui/account-selector";
import { useOperatorConfirmation } from "./ui/confirmation";

type Adjustment = {
  id: string;
  accountId: string;
  accountUsername: string;
  amountMinor: string;
  reason: string;
  reference: string | null;
  createdBy: string;
  createdAt: string;
  currentBalanceMinor?: string | null;
};

export function OperatorEarningsAdjustmentForm() {
  const router = useRouter();
  const toast = useToast();
  const [account, setAccount] = useState<OperatorAccountSummary | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch<Adjustment>("/internal/earnings-adjustments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account_id: account?.id,
          amount_minor: amount.trim(),
          reason,
          reference: reference.trim() || null,
        }),
      });
      toast.success("Earnings adjustment posted.");
      router.push("/operator/earnings-adjustments");
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "The adjustment could not be created.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <CrudEdit
      mode="create"
      eyebrow="Earnings ledger"
      title="New adjustment"
      description="Post a signed earnings adjustment for an account."
      backHref="/operator/earnings-adjustments"
      backLabel="Back to adjustments"
      saving={saving}
      onSubmit={(event) => void create(event)}
      error={error}
      submitLabel="Post adjustment"
      savingLabel="Posting…"
      sectionTitle="Adjustment details"
      widthClassName="max-w-3xl"
    >
      <p className="text-sm text-slate-600">
        Positive increases the account balance; negative decreases it. Amounts use USD minor units:
        1000 = $10.00 and -500 = -$5.00.
      </p>
      <div className="grid gap-2">
        <RequiredLabel htmlFor="adjustment-account">Account</RequiredLabel>
        <OperatorAccountSelector
          inputId="adjustment-account"
          value={account}
          onChange={setAccount}
          required
        />
      </div>
      <div className="grid gap-2">
        <RequiredLabel htmlFor="adjustment-amount">Signed amount in USD minor units</RequiredLabel>
        <Input
          id="adjustment-amount"
          inputMode="numeric"
          placeholder="e.g. 1000 or -500"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <RequiredLabel htmlFor="adjustment-reason">Reason</RequiredLabel>
        <Textarea
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
    </CrudEdit>
  );
}

export function OperatorEarningsAdjustments({
  canManage,
  canDelete = false,
}: {
  canManage: boolean;
  canDelete?: boolean;
}) {
  const confirm = useOperatorConfirmation();
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
      key: "balance",
      label: "Current earnings",
      render: (item) =>
        item.currentBalanceMinor == null ? "—" : <Money minor={item.currentBalanceMinor} />,
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
            if (
              !(await confirm({
                title: "Delete earnings adjustments?",
                description: `Delete ${selected.length} selected earning adjustments?`,
                confirmLabel: "Delete",
                destructive: true,
              }))
            )
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
      eyebrow="Earnings adjustments"
      title="Earning adjustments"
      description="Signed USD adjustments record increases and decreases to account earnings."
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
                  if (
                    !(await confirm({
                      title: "Delete earnings adjustment?",
                      description: "Delete this earnings adjustment?",
                      confirmLabel: "Delete",
                      destructive: true,
                    }))
                  )
                    return;
                  const result = await runOperatorBulkAction({
                    resource: "earnings-adjustments",
                    action: "delete",
                    ids: [item.id],
                  });
                  if (result.failed.length) throw new Error(result.failed[0]!.message);
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
      eyebrow="Earning adjustment"
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
