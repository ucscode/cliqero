"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  apiFetch,
  parseUsdMinor,
  type OperatorFundingDetail as FundingDetail,
  type OperatorFundingPage,
  type OperatorFundingState,
} from "@/lib/api-client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Money } from "../money";
import { OperatorPrimaryCell, OperatorStatusCell, OperatorValueCell } from "./ui/data-cells";
import { OperatorFilterField } from "./ui/toolbar";
import { CrudIndex } from "@/components/crud/index-page";
import { CrudDetail } from "@/components/crud/detail";
import { useCrudCollection } from "@/components/crud/use-collection";
import { CrudSortSelect } from "@/components/crud/sort-select";
import type { CrudColumn } from "@/components/crud/table";
import type { OperatorAction } from "./ui/actions-menu";
import { OperatorErrorState } from "./ui/error-state";
import { OperatorSection } from "./ui/section";

const states: Array<{ value: OperatorFundingState; label: string }> = [
  { value: "initialization_pending", label: "Initialization pending" },
  { value: "initializing", label: "Initializing" },
  { value: "awaiting_payment", label: "Awaiting payment" },
  { value: "verification_pending", label: "Verification pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "failed", label: "Failed" },
  { value: "blocked", label: "Blocked" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
  { value: "reconciliation_pending", label: "Reconciliation pending" },
];

function stateLabel(state: OperatorFundingState) {
  return states.find((item) => item.value === state)?.label ?? state;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Funding data is temporarily unavailable.";
}

type FundingAccountOption = { id: string; username: string; email: string | null };
type AdministrativeFundingState = "confirmed" | "failed" | "blocked" | "cancelled";
const administrativeStates: AdministrativeFundingState[] = [
  "confirmed",
  "failed",
  "blocked",
  "cancelled",
];

function majorFromMinor(value: string) {
  const amount = BigInt(value);
  const whole = amount / 100n;
  const fraction = (amount % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function AdministrativeFundingForm({ fundingId }: { fundingId?: string }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<FundingAccountOption[]>([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [state, setState] = useState<AdministrativeFundingState>("confirmed");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(Boolean(fundingId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createKey = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fundingId ? apiFetch<FundingDetail>(`/api/funding/${fundingId}`) : Promise.resolve(null),
      apiFetch<{ items: FundingAccountOption[] }>("/internal/funding/accounts?search=&limit=20"),
    ])
      .then(([funding, result]) => {
        if (!active) return;
        const eligible = result.items;
        setAccounts(eligible);
        if (funding) {
          if (funding.origin !== "administrative")
            throw new Error("Provider funding is immutable.");
          setAccountId(funding.account.id);
          setAmount(majorFromMinor(funding.canonicalAmountMinor));
          setState(funding.state as AdministrativeFundingState);
          setReason(funding.reason ?? "");
          setReference(funding.administrativeReference ?? "");
          if (!eligible.some((account) => account.id === funding.account.id))
            setAccounts([
              {
                id: funding.account.id,
                username: funding.account.username,
                email: funding.account.email,
              },
              ...eligible,
            ]);
        } else if (eligible[0]) setAccountId(eligible[0].id);
      })
      .catch((cause: unknown) => active && setError(errorMessage(cause)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [fundingId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    let amountMinor: string;
    try {
      amountMinor = parseUsdMinor(amount);
    } catch (cause) {
      setError(errorMessage(cause));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        amount_minor: amountMinor,
        state,
        reason,
        reference: reference.trim() || null,
        ...(fundingId ? {} : { account_id: accountId }),
      };
      if (!fundingId && !createKey.current) createKey.current = crypto.randomUUID();
      await apiFetch(fundingId ? `/internal/funding/${fundingId}` : "/internal/funding", {
        method: fundingId ? "PATCH" : "POST",
        headers: {
          "content-type": "application/json",
          ...(!fundingId ? { "Idempotency-Key": createKey.current! } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!fundingId) createKey.current = null;
      router.push("/operator/funding");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function searchAccounts(value: string) {
    setAccountSearch(value);
    try {
      const result = await apiFetch<{ items: FundingAccountOption[] }>(
        `/internal/funding/accounts?search=${encodeURIComponent(value)}&limit=20`,
      );
      setAccounts((current) => {
        const selected = current.find((account) => account.id === accountId);
        return selected && !result.items.some((account) => account.id === selected.id)
          ? [selected, ...result.items]
          : result.items;
      });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  if (loading)
    return <CrudDetail eyebrow="Funding management" title="Administrative funding" loading />;
  return (
    <CrudDetail
      eyebrow="Funding management"
      title={fundingId ? "Edit administrative funding" : "New funding"}
      description="Administrative records are distinct from provider payments. Only confirmed records affect the USD funding balance."
      sections={
        <OperatorSection title="Funding record" surface>
          {error && <OperatorErrorState message={error} />}
          <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
            {!fundingId && (
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
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Status
              <Select
                value={state}
                onChange={(event) => setState(event.target.value as AdministrativeFundingState)}
              >
                {administrativeStates.map((value) => (
                  <option key={value} value={value}>
                    {stateLabel(value)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Reason
              <Input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={1000}
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Reference (optional)
              <Input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={200}
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving || (!fundingId && !accountId)}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push("/operator/funding")}
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

export type OperatorBankTransferEvidenceRow = { label: string; value: string };

export function operatorBankTransferEvidenceRows(
  evidence: FundingDetail["evidence"],
): OperatorBankTransferEvidenceRow[] {
  if (!evidence) return [];
  return [
    ...(evidence.transferReference
      ? [{ label: "Transfer reference", value: evidence.transferReference }]
      : []),
    ...(evidence.customerNote ? [{ label: "Customer note", value: evidence.customerNote }] : []),
    ...(evidence.proof
      ? [
          { label: "Proof file", value: evidence.proof.originalFilename ?? "Uploaded file" },
          { label: "Proof type", value: evidence.proof.mimeType },
          { label: "Proof size", value: `${evidence.proof.byteSize} bytes` },
        ]
      : []),
    { label: "Submitted", value: formatDate(evidence.createdAt) },
  ];
}

export function OperatorFundingList({
  canManage = false,
  canDelete = false,
}: {
  canManage?: boolean;
  canDelete?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [state, setState] = useState<OperatorFundingState | "">("");
  const [provider, setProvider] = useState("");
  const [sortChoice, setSortChoice] = useState("created:desc");
  const [sort, direction] = sortChoice.split(":") as ["created" | "amount", "asc" | "desc"];
  const collection = useCrudCollection(
    async (
      filters: {
        search: string;
        state: OperatorFundingState | "";
        provider: string;
        sort: string;
        direction: string;
      },
      cursor,
      pageSize,
    ) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (filters.search) params.set("search", filters.search);
      if (filters.state) params.set("state", filters.state);
      if (filters.provider) params.set("provider", filters.provider);
      params.set("sort", filters.sort);
      params.set("direction", filters.direction);
      if (cursor) params.set("cursor", cursor);
      const result = await apiFetch<OperatorFundingPage>(`/api/funding?${params}`);
      return { items: result.items, nextCursor: result.nextCursor };
    },
    { search: "", state: "", provider: "", sort: "created", direction: "desc" },
  );

  const columns: readonly CrudColumn<OperatorFundingPage["items"][number]>[] = [
    {
      key: "account",
      label: "Account",
      primary: true,
      render: (funding) => (
        <OperatorPrimaryCell
          title={
            <Link href={`/operator/users/${funding.account.id}`}>@{funding.account.username}</Link>
          }
          subtitle={funding.account.email ?? funding.account.id}
        />
      ),
    },
    {
      key: "provider",
      label: "Provider / reference",
      render: (funding) => (
        <OperatorPrimaryCell
          title={
            funding.origin === "provider"
              ? (funding.provider ?? "Provider")
              : "Administrative funding"
          }
          subtitle={
            funding.providerReference ?? funding.administrativeReference ?? funding.reason ?? "—"
          }
        />
      ),
    },
    {
      key: "state",
      label: "State",
      render: (funding) => (
        <OperatorStatusCell status={funding.state} label={stateLabel(funding.state)} />
      ),
    },
    {
      key: "credit",
      label: "Credit",
      render: (funding) =>
        funding.walletCredit ? (
          <OperatorStatusCell status={funding.walletCredit.state} />
        ) : funding.walletEffect?.state === "available" ? (
          <span className="text-emerald-700">Available</span>
        ) : (
          "—"
        ),
    },
    {
      key: "amount",
      label: "Funding",
      render: (funding) => (
        <OperatorValueCell>
          <Money minor={funding.canonicalAmountMinor} />{" "}
          <span className="text-xs text-slate-500">
            (<Money minor={funding.collectionAmountMinor} currency={funding.collectionCurrency} />)
          </span>
        </OperatorValueCell>
      ),
    },
  ];
  const actions = (funding: OperatorFundingPage["items"][number]): readonly OperatorAction[] => [
    { type: "link", label: "Inspect funding", href: `/operator/funding/${funding.id}` },
    ...(canManage && funding.origin === "administrative"
      ? [{ type: "link" as const, label: "Edit", href: `/operator/funding/${funding.id}/edit` }]
      : []),
    ...(canDelete
      ? [
          {
            type: "action" as const,
            label: "Delete",
            destructive: true,
            onSelect: async () => {
              if (!window.confirm("Delete this funding record?")) return;
              await apiFetch(`/internal/funding/${funding.id}`, { method: "DELETE" });
              await collection.retry();
            },
          },
        ]
      : []),
    { type: "link", label: "View account", href: `/operator/users/${funding.account.id}` },
  ];

  return (
    <CrudIndex
      eyebrow="Funding operations"
      title="Wallet funding"
      description="Inspect provider-backed wallet funding without changing financial facts or confirming payments manually."
      filters={
        <>
          <OperatorFilterField label="Funding, reference, or account" htmlFor="funding-search">
            <Input
              id="funding-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Funding ID, reference, username, email"
            />
          </OperatorFilterField>
          <OperatorFilterField label="State" htmlFor="funding-state">
            <Select
              id="funding-state"
              value={state}
              onChange={(event) => setState(event.target.value as OperatorFundingState | "")}
            >
              <option value="">All states</option>
              {states.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </OperatorFilterField>
          <OperatorFilterField label="Provider" htmlFor="funding-provider">
            <Input
              id="funding-provider"
              type="search"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              placeholder="Provider name"
            />
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
      onFiltersSubmit={async (event) => {
        event.preventDefault();
        return collection.apply({
          search: search.trim(),
          state,
          provider: provider.trim(),
          sort,
          direction,
        });
      }}
      onFiltersReset={async () => {
        const ok = await collection.apply({
          search: "",
          state: "",
          provider: "",
          sort: "created",
          direction: "desc",
        });
        if (ok) {
          setSearch("");
          setState("");
          setProvider("");
          setSortChoice("created:desc");
        }
        return ok;
      }}
      filtersDirty={Boolean(
        search.trim() || state || provider.trim() || sortChoice !== "created:desc",
      )}
      toolbarActions={
        <Button type="submit" variant="action" disabled={collection.loading}>
          Apply filters
        </Button>
      }
      items={collection.items}
      columns={columns}
      getRowKey={(funding) => funding.id}
      selection={{
        labelForItem: (funding) => `funding ${funding.id}`,
        canSelectItem: (funding) => canDelete || funding.origin === "administrative",
      }}
      createAction={canManage ? { label: "New funding", href: "/operator/funding/new" } : undefined}
      bulkActions={
        canManage || canDelete
          ? [
              {
                value: "delete",
                label: "Delete",
                destructive: true,
                onSelect: async (items) => {
                  const ids = items
                    .filter((item) => canDelete || item.origin === "administrative")
                    .map((item) => item.id);
                  if (!ids.length) return false;
                  if (
                    !window.confirm(
                      canDelete
                        ? `Delete ${ids.length} funding record(s)? Linked provider evidence and wallet credits will be removed.`
                        : `Delete ${ids.length} administrative funding record(s)? Provider records will be retained.`,
                    )
                  )
                    return false;
                  const response = await apiFetch<{
                    results: Array<{ id: string; deleted: boolean; error: string | null }>;
                  }>("/internal/funding/bulk-delete", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ ids }),
                  });
                  await collection.retry();
                  const rejected = response.results.filter((result) => !result.deleted);
                  if (rejected.length)
                    throw new Error(rejected.map((result) => result.error).join("; "));
                },
              },
            ]
          : []
      }
      actions={actions}
      actionLabel={(funding) => `Actions for funding ${funding.id}`}
      loading={collection.loading}
      error={collection.error}
      onRetry={() => void collection.retry()}
      emptyTitle="No funding transactions found"
      emptyDescription="Try another search or state filter. Empty results do not indicate a funding failure."
      pagination={{
        hasPrevious: collection.hasPrevious,
        hasNext: collection.hasNext,
        onPrevious: () => void collection.previous(),
        onNext: () => void collection.next(),
      }}
      sectionTitle="Funding records"
      sectionDescription="Provider facts, evidence, and wallet-credit state are inspected. System-root operators can delete a funding record with its linked records."
    />
  );
}

export function OperatorFundingDetail({
  fundingId,
  canManage = false,
  canDelete = false,
}: {
  fundingId: string;
  canManage?: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [funding, setFunding] = useState<FundingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setFunding(await apiFetch<FundingDetail>(`/api/funding/${fundingId}`));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Detail always reconstructs from persisted funding facts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundingId]);

  async function copyReference() {
    if (!funding) return;
    const reference = funding.providerReference ?? funding.administrativeReference;
    if (!reference) return;
    try {
      await navigator.clipboard?.writeText(reference);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Provider reference could not be copied. Select it manually.");
    }
  }

  async function confirmBankTransfer() {
    if (!funding || !canManage || !window.confirm("Confirm that this bank transfer was received?"))
      return;
    setConfirming(true);
    setError(null);
    try {
      await apiFetch(`/api/funding/${funding.id}/confirm-bank-transfer`, {
        method: "POST",
      });
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setConfirming(false);
    }
  }

  async function deleteFunding() {
    if (!funding || !canDelete || !window.confirm("Delete this funding record?")) return;
    setError(null);
    try {
      await apiFetch(`/internal/funding/${funding.id}`, { method: "DELETE" });
      router.push("/operator/funding");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  if (loading && !funding)
    return <CrudDetail eyebrow="Funding fact" title="Wallet funding inspection" loading />;
  if (!funding)
    return (
      <CrudDetail
        eyebrow="Funding fact"
        title="Wallet funding inspection"
        error={{
          title: "Funding unavailable",
          message: error || "This funding record was not found.",
          retry: () => void load(),
        }}
      />
    );

  return (
    <CrudDetail
      eyebrow="Funding fact"
      title="Wallet funding inspection"
      description={funding.id}
      headerActions={
        <div className="flex items-center gap-2">
          <OperatorStatusCell status={funding.state} label={stateLabel(funding.state)} />
          {canDelete && (
            <Button variant="destructive" onClick={() => void deleteFunding()}>
              Delete
            </Button>
          )}
        </div>
      }
      sections={
        <>
          {error && <OperatorErrorState message={error} />}
          {canManage &&
            funding.provider === "bank_transfer" &&
            (funding.state === "awaiting_payment" || funding.state === "verification_pending") && (
              <OperatorSection
                title="Manual bank verification"
                description="Confirm only after independently verifying the transfer in the receiving account."
              >
                <Button
                  type="button"
                  disabled={confirming}
                  onClick={() => void confirmBankTransfer()}
                >
                  {confirming ? "Confirming…" : "Confirm received transfer"}
                </Button>
              </OperatorSection>
            )}
          <div className="grid gap-4 lg:grid-cols-2">
            <OperatorSection title="Funding fact" surface>
              <dl className="detail-list">
                <div>
                  <dt>Account</dt>
                  <dd>
                    <Link href={`/operator/users/${funding.account.id}`}>
                      @{funding.account.username}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd className="break-value">
                    {funding.account.email ?? "No authentication email"}
                  </dd>
                </div>
                <div>
                  <dt>Origin</dt>
                  <dd>
                    {funding.origin === "provider"
                      ? `Provider · ${funding.provider}`
                      : "Administrative funding"}
                  </dd>
                </div>
                <div>
                  <dt>
                    {funding.origin === "provider"
                      ? "Provider reference"
                      : "Administrative reference"}
                  </dt>
                  <dd className="operator-funding-reference">
                    <span className="break-value">
                      {funding.providerReference ?? funding.administrativeReference ?? "—"}
                    </span>
                    {(funding.providerReference || funding.administrativeReference) && (
                      <Button variant="ghost" onClick={() => void copyReference()}>
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Provider transaction ID</dt>
                  <dd className="break-value">
                    {funding.origin === "provider"
                      ? (funding.providerTransactionId ?? "Not known yet")
                      : "Not applicable"}
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatDate(funding.createdAt)}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDate(funding.updatedAt)}</dd>
                </div>
                <div>
                  <dt>Confirmed</dt>
                  <dd>{formatDate(funding.confirmedAt)}</dd>
                </div>
              </dl>
            </OperatorSection>
            <OperatorSection title="Amounts and wallet consequence" surface>
              <dl className="detail-list">
                <div>
                  <dt>Canonical amount</dt>
                  <dd>
                    <Money minor={funding.canonicalAmountMinor} />
                  </dd>
                </div>
                <div>
                  <dt>Collection amount</dt>
                  <dd>
                    <Money
                      minor={funding.collectionAmountMinor}
                      currency={funding.collectionCurrency}
                    />
                  </dd>
                </div>
                <div>
                  <dt>Collection currency</dt>
                  <dd>{funding.collectionCurrency}</dd>
                </div>
              </dl>
              {funding.walletCredit ? (
                <p className="operator-funding-credit-status">
                  <OperatorStatusCell status={funding.walletCredit.state} /> credit ·{" "}
                  <Money minor={funding.walletCredit.amountMinor} />
                  {funding.walletCredit.availableAt &&
                    ` · available ${formatDate(funding.walletCredit.availableAt)}`}
                </p>
              ) : funding.walletEffect?.state === "available" ? (
                <p className="operator-funding-credit-status">
                  <OperatorStatusCell status="available" /> credit ·{" "}
                  <Money minor={funding.walletEffect.amountMinor} />
                </p>
              ) : (
                <p className="panel-intro">No wallet credit has been created.</p>
              )}
            </OperatorSection>
          </div>
          {funding.conversionSnapshot && (
            <OperatorSection title="Conversion snapshot" surface>
              <dl className="detail-list">
                <div>
                  <dt>Pair</dt>
                  <dd>
                    {funding.conversionSnapshot.fromCurrency} →{" "}
                    {funding.conversionSnapshot.toCurrency}
                  </dd>
                </div>
                <div>
                  <dt>Quoted rate</dt>
                  <dd className="break-value">{funding.conversionSnapshot.rate}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{funding.conversionSnapshot.source}</dd>
                </div>
                <div>
                  <dt>Source date</dt>
                  <dd>{funding.conversionSnapshot.sourceDate}</dd>
                </div>
                <div>
                  <dt>Observed</dt>
                  <dd>{formatDate(funding.conversionSnapshot.observedAt)}</dd>
                </div>
              </dl>
            </OperatorSection>
          )}
          {funding.evidence && (
            <OperatorSection title="Bank-transfer evidence" surface>
              <dl className="detail-list">
                {operatorBankTransferEvidenceRows(funding.evidence).map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd className="break-value whitespace-pre-line">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="panel-intro">
                Proof viewing is not available from this operator screen; review the recorded
                metadata or use the configured secure retrieval mechanism when one is provided.
              </p>
            </OperatorSection>
          )}
          <OperatorSection title="Provider initialization" surface>
            <p className="panel-intro">
              {funding.providerInitialization?.authorizationUrl
                ? "An authorization URL was persisted for the provider flow. It is intentionally not exposed as an operator action."
                : "No provider authorization URL is persisted."}
            </p>
          </OperatorSection>
          <OperatorSection title="Provider operations" surface>
            {funding.operations.length ? (
              <div className="operator-funding-operation-list">
                {funding.operations.map((operation) => (
                  <div className="operator-funding-operation" key={operation.id}>
                    <div>
                      <strong>{operation.operation}</strong>
                      <span>{formatDate(operation.occurredAt)}</span>
                    </div>
                    <OperatorStatusCell status={operation.outcome} />
                    <p>
                      {operation.providerMessage || operation.failureKind || "No provider message"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-intro">No provider operations recorded.</p>
            )}
          </OperatorSection>
          <OperatorSection title="Provider events" surface>
            {funding.events.length ? (
              <div className="operator-funding-operation-list">
                {funding.events.map((event) => (
                  <div className="operator-funding-operation" key={event.id}>
                    <div>
                      <strong>{event.eventType}</strong>
                      <span>{formatDate(event.receivedAt)}</span>
                    </div>
                    <OperatorStatusCell status={event.state} />
                    <p>{event.lastError || `Outbox: ${event.outboxState || "not recorded"}`}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-intro">No correlated provider events recorded.</p>
            )}
          </OperatorSection>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh detail"}
          </Button>
        </>
      }
    />
  );
}
